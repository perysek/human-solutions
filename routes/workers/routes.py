"""
Zarządzanie pracownikami (workers) — API. IMPLEMENTATION_PLAN.md §7.

module_permission_required('workers') na każdym endpoincie — moduł 'workers'
jest przyznany wyłącznie superadmin/hr_manager w macierzy uprawnień (Faza 0),
co samo w sobie realizuje RODO_1/RODO_2 (trainer/viewer nie mają dostępu do
danych osobowych pracowników) bez dodatkowego kodu.

Zapis (create/update) i orkiestracja wielotabelowa dzieje się w
services/worker_service.py, nie tutaj — trasa zajmuje się wyłącznie
kształtem żądania/odpowiedzi.
"""
import logging

from flask import Blueprint, request, jsonify

from flask_login import login_required

from config.auth_config import module_permission_required
from exceptions import AppError, NotFoundError, ValidationError
from repositories.workers.worker_repository import WorkerRepository
from repositories.workers.worker_skill_repository import WorkerSkillRepository
from repositories.workers.worker_skill_remark_repository import WorkerSkillRemarkRepository
import services.competency_service as competency_service
import services.worker_service as worker_service
from services.alert_service import get_expiring_foreigner_docs

workers_bp = Blueprint('workers', __name__, url_prefix='/workers')


def _worker_json(row) -> dict:
    boss_name = None
    if row.get('boss_firstname'):
        boss_name = f"{row['boss_firstname']} {row['boss_surname']}"
    return {
        'id': row['id'],
        'firstname': row['firstname'],
        'surname': row['surname'],
        'full_name': f"{row['firstname']} {row['surname']}",
        'job_id': row['job_id'],
        'job_description': row.get('job_description'),
        'boss_id': row['boss_id'],
        'boss_name': boss_name,
        'gender': row['gender'],
        'hire_date': row['hire_date'].isoformat() if row['hire_date'] else None,
        'fire_date': row['fire_date'].isoformat() if row['fire_date'] else None,
        'is_active': row['fire_date'] is None,
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


def _profile_json(profile: dict) -> dict:
    out = _worker_json(profile['worker'])
    birth = profile['birth']
    out['birth'] = {
        'birth_date': birth['birth_date'].isoformat() if birth and birth['birth_date'] else None,
        'birth_place': birth['birth_place'] if birth else None,
    } if birth else {'birth_date': None, 'birth_place': None}
    out['nationalities'] = [n['nationality'] for n in profile['nationalities']]
    foreigner = profile['foreigner']
    out['foreigner'] = {
        'document_kind': foreigner['document_kind'],
        'document_validity': foreigner['document_validity'].isoformat() if foreigner['document_validity'] else None,
        'employment_basis': foreigner['employment_basis'],
        'employment_basis_validity': foreigner['employment_basis_validity'].isoformat() if foreigner['employment_basis_validity'] else None,
    } if foreigner else None
    return out


# ─── API Endpoints ────────────────────────────────────────────────────────────

@workers_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_list():
    """GET /workers/api?status=&search=&sort=&order=&page=&page_size= — WRK_1/WRK_11."""
    try:
        status = request.args.get('status') or None
        search = request.args.get('search') or None
        sort = request.args.get('sort') or None
        order = request.args.get('order') or 'asc'
        page = max(int(request.args.get('page', 1)), 1)
        page_size = min(max(int(request.args.get('page_size', 25)), 1), 200)

        rows, total = WorkerRepository().get_all(
            status=status, search=search, sort=sort, order=order,
            page=page, page_size=page_size,
        )
        return jsonify({
            'workers': [_worker_json(r) for r in rows],
            'count': total,
            'page': page,
            'page_size': page_size,
        })
    except AppError:
        raise
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowe parametry paginacji')
    except Exception:
        logging.exception('Unexpected error in api_list (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/expiring-foreigner-docs', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_expiring_foreigner_docs():
    """GET /workers/api/expiring-foreigner-docs?days=30 — WRK_10."""
    try:
        days = int(request.args.get('days', 30))
        rows = get_expiring_foreigner_docs(days)
        return jsonify({
            'workers': [
                {
                    'worker_id': r['worker_id'],
                    'full_name': f"{r['firstname']} {r['surname']}",
                    'document_kind': r['document_kind'],
                    'document_validity': r['document_validity'].isoformat() if r['document_validity'] else None,
                }
                for r in rows
            ],
            'count': len(rows),
        })
    except AppError:
        raise
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowy parametr days')
    except Exception:
        logging.exception('Unexpected error in api_expiring_foreigner_docs (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_get(worker_id):
    """GET /workers/api/<id> — profil łączony (WRK_2/3/4/5)."""
    try:
        profile = worker_service.get_worker_profile(worker_id)
        if not profile:
            raise NotFoundError('Pracownik nie znaleziony')
        return jsonify(_profile_json(profile))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api', methods=['POST'])
@login_required
@module_permission_required('workers')
def api_create():
    """POST /workers/api — WRK_6."""
    data = request.get_json() or {}
    try:
        worker_id = worker_service.create_worker(data)
        return jsonify({'success': True, 'id': worker_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>', methods=['PUT'])
@login_required
@module_permission_required('workers')
def api_update(worker_id):
    """PUT /workers/api/<id> — WRK_7."""
    data = request.get_json() or {}
    try:
        worker_service.update_worker(worker_id, data)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/deactivate', methods=['PUT'])
@login_required
@module_permission_required('workers')
def api_deactivate(worker_id):
    """PUT /workers/api/<id>/deactivate — WRK_8/RODO_4 (soft-delete, fire_date)."""
    repo = WorkerRepository()
    if not repo.get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    try:
        deactivated = repo.deactivate(worker_id)
        return jsonify({'success': True, 'already_inactive': not deactivated})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_deactivate (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/subordinates', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_subordinates(worker_id):
    """GET /workers/api/<id>/subordinates — WRK_9."""
    repo = WorkerRepository()
    if not repo.get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    try:
        rows = repo.get_subordinates(worker_id)
        subordinates = [_worker_json(r) for r in rows]
        return jsonify({'subordinates': subordinates, 'count': len(subordinates)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_subordinates (workers)')
        raise AppError('Wystąpił błąd serwera')


# ─── Competency matrix (Faza 3, IMPLEMENTATION_PLAN.md §8) ────────────────────

def _worker_skill_json(row) -> dict:
    return {
        'id': row['id'],
        'skill_id': row['skill_id'],
        'skill_description': row['skill_description'],
        'current_rating': row['current_rating'],
        'last_update': row['last_update'].isoformat() if row['last_update'] else None,
    }


@workers_bp.route('/api/<worker_id>/skills', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_get_skills(worker_id):
    """GET /workers/api/<id>/skills — oceny umiejętności pracownika (SKL_2)."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    try:
        rows = WorkerSkillRepository().get_by_worker(worker_id)
        skills = [_worker_skill_json(r) for r in rows]
        return jsonify({'skills': skills, 'count': len(skills)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_skills (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/skills', methods=['POST'])
@login_required
@module_permission_required('workers')
def api_add_skill(worker_id):
    """POST /workers/api/<id>/skills — dodaj/ustaw ocenę umiejętności (SKL_2)."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')

    data = request.get_json() or {}
    skill_id = (data.get('skill_id') or '').strip()
    rating = data.get('current_rating')
    last_update = data.get('last_update') or None

    if not skill_id:
        raise ValidationError('Identyfikator umiejętności jest wymagany')
    if rating is not None and not (1 <= int(rating) <= 3):
        raise ValidationError('Ocena musi być liczbą od 1 do 3')

    try:
        WorkerSkillRepository().set_rating(worker_id, skill_id, rating, last_update)
        return jsonify({'success': True}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_add_skill (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/skills/<skill_id>', methods=['PUT'])
@login_required
@module_permission_required('workers')
def api_update_skill(worker_id, skill_id):
    """PUT /workers/api/<id>/skills/<skill_id> — zaktualizuj ocenę (SKL_2).
    Stara/nowa wartość trafia do audit_log wewnątrz set_rating (SKL_5)."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')

    data = request.get_json() or {}
    rating = data.get('current_rating')
    last_update = data.get('last_update') or None
    if rating is not None and not (1 <= int(rating) <= 3):
        raise ValidationError('Ocena musi być liczbą od 1 do 3')

    try:
        WorkerSkillRepository().set_rating(worker_id, skill_id, rating, last_update)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update_skill (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/skills/<skill_id>', methods=['DELETE'])
@login_required
@module_permission_required('workers')
def api_remove_skill(worker_id, skill_id):
    """DELETE /workers/api/<id>/skills/<skill_id> — usuń ocenę umiejętności."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    try:
        deleted = WorkerSkillRepository().remove_rating(worker_id, skill_id)
        if not deleted:
            raise NotFoundError('Ocena nie znaleziona')
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_remove_skill (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/skills/<skill_id>/remarks', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_get_remarks(worker_id, skill_id):
    """GET /workers/api/<id>/skills/<skill_id>/remarks — historia uwag (SKL_3)."""
    worker_skill = WorkerSkillRepository().get_one(worker_id, skill_id)
    if not worker_skill:
        raise NotFoundError('Ocena umiejętności nie znaleziona')
    try:
        rows = WorkerSkillRemarkRepository().get_by_worker_skill(worker_skill['id'])
        remarks = [
            {'id': r['id'], 'remarks': r['remarks'], 'created_at': r['created_at'].isoformat() if r['created_at'] else None}
            for r in rows
        ]
        return jsonify({'remarks': remarks, 'count': len(remarks)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_remarks (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/skills/<skill_id>/remarks', methods=['POST'])
@login_required
@module_permission_required('workers')
def api_add_remark(worker_id, skill_id):
    """POST /workers/api/<id>/skills/<skill_id>/remarks — dodaj uwagę (SKL_3).
    Wymaga istniejącej oceny (worker_skills) — uwaga bez oceny nie ma się
    do czego odnosić."""
    worker_skill = WorkerSkillRepository().get_one(worker_id, skill_id)
    if not worker_skill:
        raise NotFoundError('Ocena umiejętności nie znaleziona — najpierw ustaw ocenę')

    data = request.get_json() or {}
    remarks = (data.get('remarks') or '').strip()
    if not remarks:
        raise ValidationError('Treść uwagi jest wymagana')

    try:
        WorkerSkillRemarkRepository().create(worker_skill['id'], worker_id, remarks)
        return jsonify({'success': True}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_add_remark (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/gap-analysis', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_gap_analysis(worker_id):
    """GET /workers/api/<id>/gap-analysis — luki między wymaganiami
    stanowiska a ocenami pracownika (SKL_4). Nie jest to dosłowna ścieżka z
    IMPLEMENTATION_PLAN.md §10's tabeli endpointów (tam gap-analysis wisi
    pod /jobs/api/<job_id>/gap-analysis dla widoku zbiorczego, JOB_6) — ale
    services/competency_service.get_gap_analysis() jawnie przyjmuje
    worker_id, więc wystawienie go też tutaj to prosty, jednowierszowy
    wrapper, a profil pracownika (WorkerViewPage) potrzebuje tego widoku
    bez sklejania dwóch osobnych wywołań po stronie frontendu."""
    try:
        gaps = competency_service.get_gap_analysis(worker_id)
        return jsonify({'gaps': gaps, 'count': len(gaps)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_gap_analysis (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/skill-gaps', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_skill_gaps():
    """GET /workers/api/skill-gaps?skill_id=&min_gap= — pracownicy z luką
    kompetencyjną (SKL_6)."""
    try:
        skill_id = request.args.get('skill_id') or None
        min_gap = int(request.args.get('min_gap', 1))
        rows = competency_service.filter_workers_by_skill_gap(skill_id=skill_id, min_gap=min_gap)
        results = [
            {
                'worker_id': r['worker_id'],
                'full_name': f"{r['firstname']} {r['surname']}",
                'skill_id': r['skill_id'],
                'skill_description': r['skill_description'],
                'required_rating': r['required_rating'],
                'current_rating': r['current_rating'],
                'gap': r['gap'],
            }
            for r in rows
        ]
        return jsonify({'results': results, 'count': len(results)})
    except AppError:
        raise
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowy parametr min_gap')
    except Exception:
        logging.exception('Unexpected error in api_skill_gaps (workers)')
        raise AppError('Wystąpił błąd serwera')
