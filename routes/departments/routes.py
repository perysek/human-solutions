"""
Zarządzanie działami firmy (departments) — API.

Gated pod module_permission_required('jobs'), nie osobnym modułem RBAC —
działy istnieją wyłącznie jako atrybut stanowisk (jobs.department_id), więc
dziedziczą dostęp z tego samego modułu co Stanowiska, zamiast wymagać
osobnego seeda w roles/role_permissions.
"""
import logging

from flask import Blueprint, request, jsonify
from flask_login import login_required

from config.auth_config import module_permission_required
from exceptions import AppError, ValidationError, NotFoundError, ConflictError
from repositories.departments.department_repository import DepartmentRepository

departments_bp = Blueprint('departments', __name__, url_prefix='/departments')


def _repo() -> DepartmentRepository:
    return DepartmentRepository()


def _department_json(row) -> dict:
    return {
        'id': row['id'],
        'name': row['name'],
        'description': row['description'],
        'job_count': row.get('job_count', 0),
        'worker_count': row.get('worker_count', 0),
        'manager_names': row.get('manager_names'),
        'created_at': row['created_at'].isoformat() if row.get('created_at') else None,
        'updated_at': row['updated_at'].isoformat() if row.get('updated_at') else None,
    }


@departments_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_list():
    """GET /departments/api?search= — lista działów ("Działy firmy")."""
    try:
        search = request.args.get('search') or None
        rows = _repo().get_all(search=search)
        departments = [_department_json(r) for r in rows]
        return jsonify({'departments': departments, 'count': len(departments)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api/options', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_list_options():
    """GET /departments/api/options — bare id/name lista dla selecta
    (JobForm's dział dropdown), bez agregatów z listy głównej."""
    try:
        rows = _repo().list_options()
        return jsonify({'departments': [{'id': r['id'], 'name': r['name']} for r in rows]})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list_options (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api/<int:department_id>', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_get(department_id):
    try:
        row = _repo().get_by_id(department_id)
        if not row:
            raise NotFoundError('Dział nie znaleziony')
        return jsonify(_department_json(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api', methods=['POST'])
@login_required
@module_permission_required('jobs')
def api_create():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip() or None

    if not name:
        raise ValidationError('Nazwa działu jest wymagana')

    repo = _repo()
    if repo.get_by_name(name):
        raise ConflictError(f'Dział o nazwie "{name}" już istnieje')

    try:
        new_id = repo.create(name, description)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api/<int:department_id>', methods=['PUT'])
@login_required
@module_permission_required('jobs')
def api_update(department_id):
    repo = _repo()
    existing = repo.get_by_id(department_id)
    if not existing:
        raise NotFoundError('Dział nie znaleziony')

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    description = (data.get('description') or '').strip() or None

    if not name:
        raise ValidationError('Nazwa działu jest wymagana')

    duplicate = repo.get_by_name(name)
    if duplicate and duplicate['id'] != department_id:
        raise ConflictError(f'Dział o nazwie "{name}" już istnieje')

    try:
        repo.update(department_id, name, description)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api/<int:department_id>/jobs', methods=['POST'])
@login_required
@module_permission_required('jobs')
def api_add_jobs(department_id):
    """POST /departments/api/<id>/jobs — task1's '+' modal: bulk-assign
    existing job-positions to this department. Body: {job_ids: [...]}.
    Additive/reassigning only — a job not in `job_ids` keeps whatever
    department it already had; this never removes a job from the department
    it's currently listed under. Every worker holding one of the assigned
    jobs is transitively "in" this department the next time anything reads
    DepartmentRepository (worker_count/manager_names join through jobs) —
    no separate workers.department_id column exists or is needed."""
    if not _repo().get_by_id(department_id):
        raise NotFoundError('Dział nie znaleziony')

    data = request.get_json() or {}
    raw_ids = data.get('job_ids') or []
    job_ids = [str(j).strip() for j in raw_ids if str(j).strip()]
    if not job_ids:
        raise ValidationError('Nie wybrano żadnego stanowiska')

    from repositories.jobs.job_repository import JobRepository
    job_repo = JobRepository()

    # task — 'at most one kierownicze job-position per dział' guard, bulk
    # form: block the whole batch if it would push the department past one
    # manager, whether that's >=2 managerial jobs in this one batch, or one
    # managerial job in the batch on top of a DIFFERENT managerial job the
    # department already has (a job already listed as the department's own
    # manager, re-selected in the same batch, is not a conflict with itself).
    incoming_managerial = [j['id'] for j in job_repo.get_by_ids(job_ids) if j['is_managerial']]
    if len(incoming_managerial) > 1:
        raise ConflictError('Można przypisać do działu co najwyżej jedno stanowisko kierownicze naraz.')
    if incoming_managerial:
        existing_manager = _repo().get_managerial_job(department_id)
        if existing_manager and existing_manager['id'] not in incoming_managerial:
            raise ConflictError(
                f'Dział ma już przypisanego kierownika (stanowisko "{existing_manager["id"]}") '
                '— najpierw usuń je z działu.'
            )

    try:
        updated = job_repo.assign_department(job_ids, department_id)
        return jsonify({'success': True, 'updated': updated})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_add_jobs (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api/<int:department_id>/jobs/<job_id>', methods=['DELETE'])
@login_required
@module_permission_required('jobs')
def api_remove_job(department_id, job_id):
    """DELETE /departments/api/<id>/jobs/<job_id> — Dział edit page's
    per-row remove icon: unlink one job-position from this department
    (department_id -> NULL). Not a delete of the job-position itself —
    see JobRepository.unassign_department's docstring."""
    if not _repo().get_by_id(department_id):
        raise NotFoundError('Dział nie znaleziony')

    from repositories.jobs.job_repository import JobRepository
    job = JobRepository().get_by_id(job_id)
    if not job:
        raise NotFoundError('Stanowisko nie znalezione')
    if job.get('department_id') != department_id:
        raise ValidationError('Stanowisko nie jest przypisane do tego działu')

    try:
        JobRepository().unassign_department(job_id)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_remove_job (departments)')
        raise AppError('Wystąpił błąd serwera')


@departments_bp.route('/api/<int:department_id>', methods=['DELETE'])
@login_required
@module_permission_required('jobs')
def api_delete(department_id):
    repo = _repo()
    if not repo.get_by_id(department_id):
        raise NotFoundError('Dział nie znaleziony')

    try:
        deleted = repo.delete(department_id)
        if not deleted:
            raise NotFoundError('Dział nie znaleziony')
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (departments)')
        raise AppError('Wystąpił błąd serwera')
