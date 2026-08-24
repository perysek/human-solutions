"""
Zarządzanie stanowiskami (jobs) — API. IMPLEMENTATION_PLAN.md §6.

Audyt zmian dzieje się wewnątrz JobRepository (AuditableMixin) — ta trasa
nigdy nie woła current_app.audit_repo bezpośrednio, w przeciwieństwie do
routes/users/routes.py, którego UserRepository nie ma mixina.
"""
import logging
from typing import Optional

from flask import Blueprint, request, jsonify
from flask_login import login_required

from config.auth_config import module_permission_required
from exceptions import AppError, ValidationError, NotFoundError, ConflictError
from repositories.jobs.job_repository import JobRepository
from repositories.jobs.job_skill_repository import JobSkillRepository
import services.competency_service as competency_service

jobs_bp = Blueprint('jobs', __name__, url_prefix='/jobs')


def _repo() -> JobRepository:
    return JobRepository()


def _job_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
        'department_id': row.get('department_id'),
        'department_name': row.get('department_name'),
        'is_managerial': bool(row.get('is_managerial')),
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


@jobs_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_list():
    """GET /jobs/api?search= — lista stanowisk (JOB_1)."""
    try:
        search = request.args.get('search') or None
        rows = _repo().get_all(search=search)
        jobs = [_job_json(r) for r in rows]
        return jsonify({'jobs': jobs, 'count': len(jobs)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list (jobs)')
        raise AppError('Wystąpił błąd serwera')


@jobs_bp.route('/api/<job_id>', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_get(job_id):
    """GET /jobs/api/<id> — szczegóły stanowiska."""
    try:
        row = _repo().get_by_id(job_id)
        if not row:
            raise NotFoundError('Stanowisko nie znalezione')
        return jsonify(_job_json(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (jobs)')
        raise AppError('Wystąpił błąd serwera')


def _parse_department_id(data: dict) -> Optional[int]:
    """department_id comes in as a number, numeric string, or '' / None for
    "brak" — the only shapes JobForm's SearchableSelect value can produce."""
    raw = data.get('department_id')
    if raw in (None, ''):
        return None
    try:
        department_id = int(raw)
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowy identyfikator działu')
    from repositories.departments.department_repository import DepartmentRepository
    if not DepartmentRepository().get_by_id(department_id):
        raise ValidationError('Wybrany dział nie istnieje')
    return department_id


@jobs_bp.route('/api', methods=['POST'])
@login_required
@module_permission_required('jobs')
def api_create():
    """POST /jobs/api — utwórz nowe stanowisko."""
    data = request.get_json() or {}
    job_id = (data.get('id') or '').strip()
    description = (data.get('description') or '').strip() or None
    department_id = _parse_department_id(data)
    is_managerial = bool(data.get('is_managerial'))

    if not job_id:
        raise ValidationError('Identyfikator stanowiska jest wymagany')

    repo = _repo()
    if repo.get_by_id(job_id):
        raise ConflictError(f'Stanowisko o identyfikatorze "{job_id}" już istnieje')

    try:
        repo.create(job_id, description, department_id, is_managerial)
        return jsonify({'success': True, 'id': job_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (jobs)')
        raise AppError('Wystąpił błąd serwera')


@jobs_bp.route('/api/<job_id>', methods=['PUT'])
@login_required
@module_permission_required('jobs')
def api_update(job_id):
    """PUT /jobs/api/<id> — zaktualizuj stanowisko."""
    repo = _repo()
    if not repo.get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')

    data = request.get_json() or {}
    description = (data.get('description') or '').strip() or None
    department_id = _parse_department_id(data)
    is_managerial = bool(data.get('is_managerial'))

    try:
        repo.update(job_id, description, department_id, is_managerial)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (jobs)')
        raise AppError('Wystąpił błąd serwera')


@jobs_bp.route('/api/<job_id>', methods=['DELETE'])
@login_required
@module_permission_required('jobs')
def api_delete(job_id):
    """DELETE /jobs/api/<id> — usuń stanowisko (blokowane, jeśli w użyciu)."""
    repo = _repo()
    if not repo.get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')

    try:
        deleted = repo.delete(job_id)
        if not deleted:
            raise NotFoundError('Stanowisko nie znalezione')
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (jobs)')
        raise AppError('Wystąpił błąd serwera')


# ─── Competency matrix (Faza 3, IMPLEMENTATION_PLAN.md §8) ────────────────────

def _job_skill_json(row) -> dict:
    return {
        'skill_id': row['skill_id'],
        'skill_description': row['skill_description'],
        'required_rating': row['required_rating'],
    }


@jobs_bp.route('/api/<job_id>/skills', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_get_skills(job_id):
    """GET /jobs/api/<id>/skills — wymagane umiejętności stanowiska (JOB_2)."""
    if not _repo().get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')
    try:
        rows = JobSkillRepository().get_by_job(job_id)
        skills = [_job_skill_json(r) for r in rows]
        return jsonify({'skills': skills, 'count': len(skills)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_skills (jobs)')
        raise AppError('Wystąpił błąd serwera')


@jobs_bp.route('/api/<job_id>/skills', methods=['PUT'])
@login_required
@module_permission_required('jobs')
def api_set_skills(job_id):
    """PUT /jobs/api/<id>/skills — zastąp cały zestaw wymaganych
    umiejętności stanowiska (JOB_4). Body: {skills: [{skill_id, required_rating}]}."""
    if not _repo().get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')

    data = request.get_json() or {}
    requirements = data.get('skills') or []
    for req in requirements:
        rating = req.get('required_rating')
        if rating is None or not (1 <= int(rating) <= 3):
            raise ValidationError('Wymagana ocena musi być liczbą od 1 do 3')

    try:
        JobSkillRepository().replace_requirements(job_id, requirements)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_set_skills (jobs)')
        raise AppError('Wystąpił błąd serwera')


@jobs_bp.route('/api/<job_id>/workers', methods=['GET'])
@login_required
# 'workers', not 'jobs' — this surfaces worker names (RODO-scoped personal
# data), so it must gate on real worker-data access, not job-dictionary
# access, even though today both modules happen to have identical grants.
@module_permission_required('workers')
def api_get_workers(job_id):
    """GET /jobs/api/<id>/workers — pracownicy na tym stanowisku (JOB_5)."""
    if not _repo().get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')
    try:
        from repositories.workers.worker_repository import WorkerRepository
        rows = WorkerRepository().get_by_job(job_id)
        workers = [
            {
                'id': r['id'],
                'full_name': f"{r['firstname']} {r['surname']}",
                'is_active': r['fire_date'] is None,
            }
            for r in rows
        ]
        return jsonify({'workers': workers, 'count': len(workers)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_workers (jobs)')
        raise AppError('Wystąpił błąd serwera')


@jobs_bp.route('/api/<job_id>/gap-analysis', methods=['GET'])
@login_required
# Same reasoning as api_get_workers — this is worker performance data, gate
# on 'workers', not 'jobs'.
@module_permission_required('workers')
def api_gap_analysis(job_id):
    """GET /jobs/api/<id>/gap-analysis — dla każdego pracownika na tym
    stanowisku: luki między wymaganiami a posiadanymi ocenami (JOB_6)."""
    if not _repo().get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')
    try:
        result = competency_service.get_job_gap_analysis(job_id)
        return jsonify({'workers': result, 'count': len(result)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_gap_analysis (jobs)')
        raise AppError('Wystąpił błąd serwera')
