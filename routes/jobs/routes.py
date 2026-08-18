"""
Zarządzanie stanowiskami (jobs) — API. IMPLEMENTATION_PLAN.md §6.

Audyt zmian dzieje się wewnątrz JobRepository (AuditableMixin) — ta trasa
nigdy nie woła current_app.audit_repo bezpośrednio, w przeciwieństwie do
routes/users/routes.py, którego UserRepository nie ma mixina.
"""
import logging

from flask import Blueprint, request, jsonify
from flask_login import login_required

from config.auth_config import module_permission_required
from exceptions import AppError, ValidationError, NotFoundError, ConflictError
from repositories.jobs.job_repository import JobRepository

jobs_bp = Blueprint('jobs', __name__, url_prefix='/jobs')


def _repo() -> JobRepository:
    return JobRepository()


def _job_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
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


@jobs_bp.route('/api', methods=['POST'])
@login_required
@module_permission_required('jobs')
def api_create():
    """POST /jobs/api — utwórz nowe stanowisko."""
    data = request.get_json() or {}
    job_id = (data.get('id') or '').strip()
    description = (data.get('description') or '').strip() or None

    if not job_id:
        raise ValidationError('Identyfikator stanowiska jest wymagany')

    repo = _repo()
    if repo.get_by_id(job_id):
        raise ConflictError(f'Stanowisko o identyfikatorze "{job_id}" już istnieje')

    try:
        repo.create(job_id, description)
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
    """PUT /jobs/api/<id> — zaktualizuj opis stanowiska."""
    repo = _repo()
    if not repo.get_by_id(job_id):
        raise NotFoundError('Stanowisko nie znalezione')

    data = request.get_json() or {}
    description = (data.get('description') or '').strip() or None

    try:
        repo.update(job_id, description)
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
