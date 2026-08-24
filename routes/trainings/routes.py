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
import os

from flask import Blueprint, Response, request, jsonify
from flask_login import login_required, current_user

from config.auth_config import is_read_only, module_permission_required, role_required
from exceptions import AppError, NotFoundError, PermissionDeniedError, ValidationError
import services.training_service as training_service
import services.training_presence_service as training_presence_service
import services.csv_export_service as csv_export_service
from repositories.trainings.training_repository import TrainingRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_job_repository import TrainingJobRepository
from repositories.trainings.training_skill_repository import TrainingSkillRepository
from repositories.trainings.training_trainer_repository import TrainingTrainerRepository
from repositories.trainings.training_presence_repository import TrainingPresenceRepository

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


def _training_list_json(row, *, viewer: bool) -> dict:
    """Task 1/3 — three extra, catalog-only columns on top of _training_json
    (TrainingRepository.get_all's computed `participant_count`/`trainer_names`/
    `trainer_ids`/`last_session_date`, not present on a single-training GET).
    `viewer` picks `trainer_ids` over `trainer_names` — same RODO_3/OQ_3 name
    redaction as `_redact_participant_for_viewer`, applied here instead of a
    separate post-hoc redact pass since there's only one name-bearing field."""
    d = _training_json(row)
    d['participant_count'] = row['participant_count']
    d['trainer_names'] = row['trainer_ids'] if viewer else row['trainer_names']
    d['last_session_date'] = row['last_session_date'].isoformat() if row['last_session_date'] else None
    return d


def _participant_json(row, confirmed_ids: set = frozenset()) -> dict:
    return {
        'id': row['id'],
        'training_id': row['training_id'],
        'worker_id': row['worker_id'],
        'worker_name': f"{row['worker_firstname']} {row['worker_surname']}",
        'start_date': row['start_date'].isoformat() if row['start_date'] else None,
        'finish_date': row['finish_date'].isoformat() if row['finish_date'] else None,
        'remarks': row['remarks'],
        'effectiveness_date': row['effectiveness_date'].isoformat() if row['effectiveness_date'] else None,
        # MOBILE_PRESENCE_CONFIRMATION_PLAN.md §4.4 — mobile sign-in ✓ badge.
        # confirmed_ids is a set of training_participant_id built once per
        # list call (TrainingPresenceRepository.get_by_training), not a
        # per-row query.
        'confirmed': row['id'] in confirmed_ids,
    }


def _redact_participant_for_viewer(p: dict) -> dict:
    """OQ_3: `viewer` sees the participant list, but names become ids."""
    p = dict(p)
    p['worker_name'] = p['worker_id']
    return p


# ─── Trainings CRUD (TRN_1/2/6/7) ──────────────────────────────────────────

@trainings_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_list():
    """GET /trainings/api?search=&sort=&order=&page=&page_size=&skill_id= — TRN_1.
    `skill_id` (ActionPlanModal's "Szkolenie" picker) narrows to trainings
    actually linked to that skill via training_skills — see
    TrainingRepository.get_all's docstring."""
    try:
        search = request.args.get('search') or None
        sort = request.args.get('sort') or None
        order = request.args.get('order') or 'asc'
        page = max(int(request.args.get('page', 1)), 1)
        page_size = min(max(int(request.args.get('page_size', 25)), 1), 200)
        skill_id = request.args.get('skill_id') or None

        rows, total = TrainingRepository().get_all(search=search, sort=sort, order=order, page=page, page_size=page_size, skill_id=skill_id)
        viewer = current_user.role == 'viewer'
        return jsonify({
            'trainings': [_training_list_json(r, viewer=viewer) for r in rows],
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


# ─── Trainer links (Task 2) ─────────────────────────────────────────────────

@trainings_bp.route('/api/<int:training_id>/trainer-links', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_get_trainer_links(training_id):
    """GET /trainings/api/<id>/trainer-links — broader than job-links'/
    skill-links' role_required('superadmin', 'hr_manager') on purpose:
    TrainingViewPage's isOwnerTrainer bootstrapping check needs a `trainer`
    role user to read their own training's trainer set to begin with (same
    reasoning api_list_participants uses module_permission_required instead
    of role_required — see this module's own docstring). Redacted for
    `viewer` (RODO_3/OQ_3), same as participants."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    try:
        rows = TrainingTrainerRepository().get_by_training(training_id)
        viewer = current_user.role == 'viewer'
        trainers = [
            {
                'trainer_id': r['trainer_id'],
                'trainer_name': r['trainer_id'] if viewer else f"{r['trainer_firstname']} {r['trainer_surname']}",
            }
            for r in rows
        ]
        return jsonify({'trainers': trainers, 'count': len(trainers)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_trainer_links (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/trainer-links', methods=['PUT'])
@login_required
@role_required('superadmin', 'hr_manager')
def api_set_trainer_links(training_id):
    """Body: {trainer_ids: [...]} — zastępuje cały zestaw prowadzących to
    szkolenie (Task 2, training_trainers). Mutation stays admin-only, same
    as job-links/skill-links PUT, even though the GET above is broader —
    `trainer` can see who runs their training, not reassign it."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    data = request.get_json() or {}
    try:
        TrainingTrainerRepository().replace_links(training_id, data.get('trainer_ids') or [])
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_set_trainer_links (trainings)')
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
        confirmed_ids = {c['training_participant_id'] for c in TrainingPresenceRepository().get_by_training(training_id)}
        participants = [_participant_json(r, confirmed_ids) for r in rows]
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


@trainings_bp.route('/api/participants/<int:participant_id>', methods=['DELETE'])
@login_required
@module_permission_required('trainings')
def api_remove_participant(participant_id):
    """DELETE /trainings/api/participants/<id> — soft delete (is_deleted/
    deleted_at, migration f6a7b8c9d0e1): the "Uczestnicy" table's row delete
    icon. Pełny dostęp + trener-właściciel (training_service.remove_participant
    woła assert_trainer_can_edit)."""
    try:
        training_service.remove_participant(participant_id, current_user)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_remove_participant (trainings)')
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


# ─── Open trainings report (Task 4 — "Szkolenia otwarte") ──────────────────

@trainings_bp.route('/api/open-report', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_open_report():
    """GET /trainings/api/open-report — every worker's not-yet-fully-completed
    enrollment (TrainingParticipantRepository.get_open_report: finish_date
    AND effectiveness_date both set is the "done" bar, same one
    TrainingRepository.recalculate_completion uses), across every training.
    Ordered worker-first server-side so the frontend can group rows under
    their worker the same way CompetencyGapsReportPage does (first row of
    each block carries the employee cell, the rest render it blank).
    Redacted for `viewer` (RODO_3/OQ_3), same as participants/trainer links."""
    try:
        rows = TrainingParticipantRepository().get_open_report()
        viewer = current_user.role == 'viewer'
        results = [
            {
                'participant_id': r['id'],
                'training_id': r['training_id'],
                'worker_id': r['worker_id'],
                'worker_name': r['worker_id'] if viewer else f"{r['worker_firstname']} {r['worker_surname']}",
                'training_description': r['training_description'],
                'planned_date': r['training_date'].isoformat() if r['training_date'] else None,
                'trainer_name': r['trainer_ids'] if viewer else r['trainer_names'],
                'start_date': r['start_date'].isoformat() if r['start_date'] else None,
                'finish_date': r['finish_date'].isoformat() if r['finish_date'] else None,
                'effectiveness_date': r['effectiveness_date'].isoformat() if r['effectiveness_date'] else None,
                'status': r['status'],
            }
            for r in rows
        ]
        return jsonify({'results': results, 'count': len(results)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_open_report (trainings)')
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
                'trainer_name': r['trainer_names'],
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


# ─── Mobile presence confirmation — sign-in link (MOBILE_PRESENCE_CONFIRMATION_PLAN.md §4.4) ──

def _absolute_confirm_url(token: str) -> str:
    """The QR-encoded URL is scanned by a phone with no "current origin" —
    unlike /reset-password/<token> (routes/auth/routes.py:175), which is
    shown *inside* the SPA and can stay a relative path, this one must be
    absolute. FRONTEND_URL defaults to the Vite dev server; set it in
    production .env to the deployed SPA's real origin."""
    base = os.environ.get('FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    return f'{base}/confirm/{token}'


def _qr_png_base64(url: str) -> str:
    """Server-side QR PNG, base64-encoded — rides the Pillow already
    installed for OCR (requirements.txt), so no new frontend dependency is
    needed to render the code (plan §2)."""
    import base64
    import io
    import qrcode

    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('ascii')


@trainings_bp.route('/api/<int:training_id>/sign-in-link', methods=['GET'])
@login_required
@module_permission_required('trainings')
def api_get_sign_in_link(training_id):
    """GET /trainings/api/<id>/sign-in-link — status panelu "Lista obecności"
    na TrainingViewPage: aktywny link (jeśli jest) + licznik potwierdzonych."""
    try:
        status = training_presence_service.get_sign_in_status(training_id, current_user)
        active = status['active_token']
        return jsonify({
            'active': active is not None,
            'url': _absolute_confirm_url(active['token']) if active else None,
            'expires_at': active['expires_at'].isoformat() if active else None,
            'confirmed': status['confirmed'],
            'total': status['total'],
        })
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_sign_in_link (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/sign-in-link', methods=['POST'])
@login_required
@module_permission_required('trainings')
def api_create_sign_in_link(training_id):
    """POST /trainings/api/<id>/sign-in-link — generuje/regeneruje token
    (unieważnia poprzedni aktywny) i zwraca gotowy PNG QR."""
    try:
        result = training_presence_service.generate_sign_in_link(training_id, current_user)
        url = _absolute_confirm_url(result['token'])
        return jsonify({
            'success': True,
            'token': result['token'],
            'url': url,
            'qr_png_base64': _qr_png_base64(url),
            'expires_at': result['expires_at'].isoformat(),
        }), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create_sign_in_link (trainings)')
        raise AppError('Wystąpił błąd serwera')


@trainings_bp.route('/api/<int:training_id>/sign-in-link', methods=['DELETE'])
@login_required
@module_permission_required('trainings')
def api_revoke_sign_in_link(training_id):
    """DELETE /trainings/api/<id>/sign-in-link — wcześniejsze unieważnienie
    (zamyka okno na spóźnione/nieuprawnione potwierdzenia)."""
    try:
        training_presence_service.revoke_sign_in_link(training_id, current_user)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_revoke_sign_in_link (trainings)')
        raise AppError('Wystąpił błąd serwera')
