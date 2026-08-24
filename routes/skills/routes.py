"""
Zarządzanie umiejętnościami (skills) — API. IMPLEMENTATION_PLAN.md §6.
Lustrzane odbicie routes/jobs/routes.py — patrz tamten plik po pełne
uzasadnienie wzorca (audyt wewnątrz repozytorium, nie w trasie).
"""
import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required

from config.auth_config import module_permission_required
from exceptions import AppError, ConflictError, NotFoundError, ValidationError
from repositories.jobs.job_skill_repository import JobSkillRepository
from repositories.skills.skill_repository import SkillRepository

skills_bp = Blueprint('skills', __name__, url_prefix='/skills')


def _repo() -> SkillRepository:
    return SkillRepository()


def _skill_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
        # Only present on rows from SkillRepository.get_all (api_list) —
        # get_by_id (api_get) doesn't compute them, so these read as 0.
        'job_count': row.get('job_count', 0),
        'gap_worker_count': row.get('gap_worker_count', 0),
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


@skills_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('skills')
def api_list():
    """GET /skills/api?search= — lista umiejętności (SKL_1)."""
    try:
        search = request.args.get('search') or None
        rows = _repo().get_all(search=search)
        skills = [_skill_json(r) for r in rows]
        return jsonify({'skills': skills, 'count': len(skills)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list (skills)')
        raise AppError('Wystąpił błąd serwera')


@skills_bp.route('/api/<skill_id>', methods=['GET'])
@login_required
@module_permission_required('skills')
def api_get(skill_id):
    """GET /skills/api/<id> — szczegóły umiejętności."""
    try:
        row = _repo().get_by_id(skill_id)
        if not row:
            raise NotFoundError('Umiejętność nie znaleziona')
        return jsonify(_skill_json(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (skills)')
        raise AppError('Wystąpił błąd serwera')


@skills_bp.route('/api/<skill_id>/jobs', methods=['GET'])
@login_required
@module_permission_required('skills')
def api_get_jobs(skill_id):
    """GET /skills/api/<id>/jobs — stanowiska wymagające tej umiejętności
    (odwrotność /jobs/api/<id>/skills). Zasila filtr "Dodaj stanowisko" na
    stronie szczegółów szkolenia wewnętrznego, gdy do szkolenia przypisano
    już jakąś umiejętność."""
    if not _repo().get_by_id(skill_id):
        raise NotFoundError('Umiejętność nie znaleziona')
    try:
        rows = JobSkillRepository().get_by_skill(skill_id)
        jobs = [{'job_id': r['job_id'], 'job_description': r['job_description'], 'required_rating': r['required_rating']} for r in rows]
        return jsonify({'jobs': jobs, 'count': len(jobs)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_jobs (skills)')
        raise AppError('Wystąpił błąd serwera')


@skills_bp.route('/api', methods=['POST'])
@login_required
@module_permission_required('skills')
def api_create():
    """POST /skills/api — utwórz nową umiejętność."""
    data = request.get_json() or {}
    skill_id = (data.get('id') or '').strip()
    description = (data.get('description') or '').strip()

    if not skill_id or not description:
        raise ValidationError('Identyfikator i opis umiejętności są wymagane')

    repo = _repo()
    if repo.get_by_id(skill_id):
        raise ConflictError(f'Umiejętność o identyfikatorze "{skill_id}" już istnieje')

    try:
        repo.create(skill_id, description)
        return jsonify({'success': True, 'id': skill_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (skills)')
        raise AppError('Wystąpił błąd serwera')


@skills_bp.route('/api/<skill_id>', methods=['PUT'])
@login_required
@module_permission_required('skills')
def api_update(skill_id):
    """PUT /skills/api/<id> — zaktualizuj opis umiejętności."""
    repo = _repo()
    if not repo.get_by_id(skill_id):
        raise NotFoundError('Umiejętność nie znaleziona')

    data = request.get_json() or {}
    description = (data.get('description') or '').strip()
    if not description:
        raise ValidationError('Opis umiejętności jest wymagany')

    try:
        repo.update(skill_id, description)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (skills)')
        raise AppError('Wystąpił błąd serwera')


@skills_bp.route('/api/<skill_id>', methods=['DELETE'])
@login_required
@module_permission_required('skills')
def api_delete(skill_id):
    """DELETE /skills/api/<id> — usuń umiejętność (blokowane, jeśli w użyciu)."""
    repo = _repo()
    if not repo.get_by_id(skill_id):
        raise NotFoundError('Umiejętność nie znaleziona')

    try:
        deleted = repo.delete(skill_id)
        if not deleted:
            raise NotFoundError('Umiejętność nie znaleziona')
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (skills)')
        raise AppError('Wystąpił błąd serwera')
