"""
Zarządzanie szkoleniami wewnętrznymi (trainings) — API. IMPLEMENTATION_PLAN.md §10.

Trzy różne bramy współistnieją na tym blueprincie, w przeciwieństwie do
routes/workers/routes.py (gdzie module_permission_required('workers') jest
jedyną bramą wszędzie, bo moduł 'workers' i tak jest superadmin/hr_manager-
only):

  * `module_permission_required('trainings')` — każda z czterech ról ma
    jakiś dostęp do tego modułu (Faza 0's macierz), więc to sam w sobie za
    mało dla endpointów, które PRD ogranicza do "pełnego dostępu".
  * `role_required('superadmin', 'hr_manager')` — dosłowna brama roli, dla
    akcji administracyjnych (tworzenie/usuwanie szkolenia, zarządzanie
    powiązaniami ze stanowiskami/umiejętnościami, historia szkoleń
    pracownika) — `trainer`/`viewer` nie mają tu wyjątku.
  * `services.training_service.assert_trainer_can_edit(...)` — wywoływane
    *wewnątrz* handlera (nie da się wyrazić jako dekorator, bo zależy od
    treści żądania: training_id z URL-a, właściciel z bazy) dla endpointów,
    które `trainer` może dotknąć wyłącznie dla swoich własnych szkoleń
    (TRN_7/8/9/11).

`_redact_for_viewer` (RODO_3/OQ_3, potwierdzone): rola `viewer` widzi listę
uczestników/trenera, ale z imieniem i nazwiskiem zastąpionym identyfikatorem
pracownika — lista NIE jest ukrywana ani redukowana do samej liczby.
"""
import logging

from flask import Blueprint, Response, request, jsonify
from flask_login import login_required, current_user

from config.auth_config import is_read_only, module_permission_required, role_required
from exceptions import AppError, NotFoundError, PermissionDeniedError, ValidationError
import services.training_service as training_service
import services.csv_export_service as csv_export_service
from repositories.trainings.training_repository import TrainingRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_job_repository import TrainingJobRepository
from repositories.trainings.training_skill_repository import TrainingSkillRepository

trainings_bp = Blueprint('trainings', __name__, url_prefix='/trainings')


def _training_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
        'remarks': row['remarks'],
        'training_date': row['training_date'].isoformat() if row['training_date'] else None,
        'completion': row['completion'],
        'related_docs': row['related_docs'],
        'training_details': row['training_details'],
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


def _participant_json(row) -> dict:
    return {
        'id': row['id'],
        'training_id': row['training_id'],
        'worker_id': row['worker_id'],
        'worker_name': f"{row['worker_firstname']} {row['worker_surname']}",
        'start_date': row['start_date'].isoformat() if row['start_date'] else None,
        'finish_date': row['finish_date'].isoformat() if row['finish_date'] else None,
        'remarks': row['remarks'],
        'trainer_id': row['trainer_id'],
        'trainer_name': f"{row['trainer_firstname']} {row['trainer_surname']}" if row['trainer_id'] else None,
        'effectiveness_date': row['effectiveness_date'].isoformat() if row['effectiveness_date'] else None,
    }


def _redact_participant_for_viewer(p: dict) -> dict:
    """OQ_3: `viewer` sees the participant list, but names become ids."""
    p = dict(p)
    p['worker_name'] = p['worker_id']
    if p['trainer_id']:
        p['trainer_name'] = p['trainer_id']
    return p


# ─── Trainings CRUD (TRN_1/2/6/7) ──────────────────────────────────────────

@trainings_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_list():
    """GET /trainings/api?search=&sort=&order=&page=&page_size= — TRN_1."""
    try:
        search = request.args.get('search') or None
        sort = request.args.get('sort') or None
        order = request.args.get('order') or 'asc'
        page = max(int(request.args.get('page', 1)), 1)
        page_size = min(max(int(request.args.get('page_size', 25)), 1), 200)

        rows, total = TrainingRepository().get_all(search=search, sort=sort, order=order, page=page, page_size=page_size)
        return jsonify({
            'trainings': [_training_json(r) for r in rows],
            'count': total,
            'page': page,
            'page_size': page_size,
        })
    except AppError:
        raise
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowe parametry paginacji')
    except Exception:
        logging.exception('Unexpected error in api_list (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_get(training_id):
    """GET /trainings/api/<id> — TRN_2/3/4."""
    row = TrainingRepository().get_by_id(training_id)
    if not row:
        raise NotFoundError('Szkolenie nie znalezione')
    try:
        return jsonify(_training_json(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api', methods=['POST'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_create():
    """POST /trainings/api — TRN_6."""
    data = request.get_json() or {}
    try:
        new_id = training_service.create_training(data)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>', methods=['PUT'])
@login_required
@module_permission_required('trainings')
def api_update(training_id):
    """PUT /trainings/api/<id> — TRN_7. Full-access roles may edit any
    training; `trainer` only one it actually runs (training_service.update_training
    calls assert_trainer_can_edit)."""
    data = request.get_json() or {}
    try:
        training_service.update_training(training_id, data, current_user)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>', methods=['DELETE'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_delete(training_id):
    """DELETE /trainings/api/<id>."""
    try:
        training_service.delete_training(training_id)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (trainings)')
        raise AppError('Wystąpił błąd serwera')


# ─── Job/skill links (TRN_3/4) ─────────────────────────────────────────────

@trainings_bp.route('/api/<int:training_id>/job-links', methods=['GET'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_get_job_links(training_id):
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    try:
        rows = TrainingJobRepository().get_by_training(training_id)
        jobs = [{'job_id': r['job_id'], 'job_description': r['job_description']} for r in rows]
        return jsonify({'jobs': jobs, 'count': len(jobs)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_job_links (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/job-links', methods=['PUT'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_set_job_links(training_id):
    """Body: {job_ids: [...]} — zastępuje cały zestaw powiązanych stanowisk (TRN_3)."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    data = request.get_json() or {}
    try:
        TrainingJobRepository().replace_links(training_id, data.get('job_ids') or [])
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_set_job_links (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/skill-links', methods=['GET'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_get_skill_links(training_id):
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    try:
        rows = TrainingSkillRepository().get_by_training(training_id)
        skills = [{'skill_id': r['skill_id'], 'skill_description': r['skill_description']} for r in rows]
        return jsonify({'skills': skills, 'count': len(skills)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_skill_links (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/skill-links', methods=['PUT'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_set_skill_links(training_id):
    """Body: {skill_ids: [...]} — zastępuje cały zestaw powiązanych umiejętności (TRN_4)."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    data = request.get_json() or {}
    try:
        TrainingSkillRepository().replace_links(training_id, data.get('skill_ids') or [])
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_set_skill_links (trainings)')
        raise AppError('Wystąpił błąd serwera')


# ─── Participants (TRN_5/8/9/11) ───────────────────────────────────────────

@trainings_bp.route('/api/<int:training_id>/participants', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_list_participants(training_id):
    """GET /trainings/api/<id>/participants — TRN_5, zredagowane dla viewer (OQ_3)."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    try:
        rows = TrainingParticipantRepository().get_by_training(training_id)
        participants = [_participant_json(r) for r in rows]
        if current_user.role == 'viewer':
            participants = [_redact_participant_for_viewer(p) for p in participants]
        return jsonify({'participants': participants, 'count': len(participants)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list_participants (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/participants', methods=['POST'])
@login_required
@module_permission_required('trainings')
def api_add_participant(training_id):
    """POST /trainings/api/<id>/participants — TRN_8. Pełny dostęp + trener-właściciel
    (training_service.register_participant woła assert_trainer_can_edit)."""
    data = request.get_json() or {}
    try:
        new_id = training_service.register_participant(training_id, data, current_user)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_add_participant (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/participants/<int:participant_id>', methods=['PUT'])
@login_required
@module_permission_required('trainings')
def api_update_participant(participant_id):
    """PUT /trainings/api/participants/<id> — TRN_8/9."""
    data = request.get_json() or {}
    try:
        training_service.update_participant(participant_id, data, current_user)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update_participant (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/participants/export', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_export_participants(training_id):
    """GET /trainings/api/<id>/participants/export — TRN_11. Pełny dostęp +
    trener-właściciel; **nie** viewer — module_permission_required('trainings')
    lets viewer's GET through (read_only only blocks mutating methods), so
    the export ban from OQ_3 needs its own explicit check here."""
    if is_read_only(current_user.role, 'trainings'):
        raise PermissionDeniedError('Eksport CSV nie jest dostępny dla tej roli.')
    try:
        training_service.assert_trainer_can_edit(training_id, current_user)
        csv_bytes = csv_export_service.export_training_participants_csv(training_id)
        return Response(
            csv_bytes,
            mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename="szkolenie_{training_id}_uczestnicy.csv"'},
        )
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_export_participants (trainings)')
        raise AppError('Wystąpił błąd serwera')


# ─── Worker training history (TRN_10) ──────────────────────────────────────

@trainings_bp.route('/api/worker/<worker_id>/history', methods=['GET'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_worker_history(worker_id):
    """GET /trainings/api/worker/<worker_id>/history — TRN_10."""
    try:
        rows = training_service.list_worker_history(worker_id)
        history = [
            {
                'participant_id': r['id'],
                'training_id': r['training_id'],
                'training_description': r['training_description'],
                'training_date': r['training_date'].isoformat() if r['training_date'] else None,
                'start_date': r['start_date'].isoformat() if r['start_date'] else None,
                'finish_date': r['finish_date'].isoformat() if r['finish_date'] else None,
                'remarks': r['remarks'],
                'trainer_name': f"{r['trainer_firstname']} {r['trainer_surname']}" if r['trainer_id'] else None,
                'effectiveness_date': r['effectiveness_date'].isoformat() if r['effectiveness_date'] else None,
            }
            for r in rows
        ]
        return jsonify({'history': history, 'count': len(history)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_worker_history (trainings)')
        raise AppError('Wystąpił błąd serwera')
