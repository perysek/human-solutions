"""
Zarządzanie stanowiskami (jobs) — API. IMPLEMENTATION_PLAN.md §6.

Audyt zmian dzieje się wewnątrz JobRepository (AuditableMixin) — ta trasa
nigdy nie woła current_app.audit_repo bezpośrednio, w przeciwieństwie do
routes/users/routes.py, którego UserRepository nie ma mixina.
"""
import logging
from typing import Optional

from flask import Blueprint, jsonify, request
from flask_login import login_required

import services.competency_service as competency_service
import services.org_chart_service as org_chart_service
from config.auth_config import module_permission_required
from exceptions import AppError, ConflictError, NotFoundError, ValidationError
from repositories.jobs.job_repository import JobRepository
from repositories.jobs.job_skill_repository import JobSkillRepository
from repositories.org_chart.org_chart_revision_repository import OrgChartRevisionRepository

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
        'is_director': bool(row.get('is_director')),
        'supervisor_job_id': row.get('supervisor_job_id'),
        'supervisor_job_description': row.get('supervisor_job_description'),
        'worker_count': row.get('worker_count') or 0,
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


def _check_single_manager(department_id: Optional[int], is_managerial: bool, job_id: Optional[str] = None) -> None:
    """'At most one kierownicze job-position per dział' guard — friendly
    pre-check backing the partial unique index idx_jobs_one_manager_per_department
    (migration d1e2f3a4b5c6). `job_id` is the job being saved (None at
    create) so editing/re-saving the department's own existing manager
    doesn't conflict with itself."""
    if not is_managerial or department_id is None:
        return
    from repositories.departments.department_repository import DepartmentRepository
    existing = DepartmentRepository().get_managerial_job(department_id)
    if existing and existing['id'] != job_id:
        raise ConflictError(
            f'Dział ma już przypisane stanowisko kierownicze ("{existing["id"]}") '
            '— dział może mieć tylko jedno stanowisko kierownicze naraz.'
        )


def _apply_director_flag(repo: JobRepository, is_director: bool, job_id: Optional[str] = None) -> Optional[str]:
    """'At most one Dyrektor zakładu' — unlike _check_single_manager above,
    this does NOT block the save. If another job-position already holds the
    flag, it's silently demoted (JobRepository.clear_director) and a
    non-blocking warning string is returned for the route to surface as a
    toast instead of a 409 — the product decision here is "let the newest
    save win, tell the user what happened", not "reject the write".
    `job_id` is the job being saved (None at create) so re-saving the
    current director doesn't demote itself."""
    if not is_director:
        return None
    existing = repo.get_director_job()
    if not existing or existing['id'] == job_id:
        return None
    repo.clear_director(existing['id'])
    return (
        f'Poprzednie stanowisko Dyrektora zakładu ("{existing["id"]}") '
        'zostało zastąpione tym stanowiskiem — może istnieć tylko jeden dyrektor naraz.'
    )


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
    is_director = bool(data.get('is_director'))

    if not job_id:
        raise ValidationError('Identyfikator stanowiska jest wymagany')

    repo = _repo()
    if repo.get_by_id(job_id):
        raise ConflictError(f'Stanowisko o identyfikatorze "{job_id}" już istnieje')
    _check_single_manager(department_id, is_managerial)
    warning = _apply_director_flag(repo, is_director)

    before_revision_id = OrgChartRevisionRepository().get_latest_id()
    try:
        repo.create(job_id, description, department_id, is_managerial, is_director)
        # The DB trigger only exists for jobs UPDATE (of is_managerial/
        # is_director/department_id) and DELETE, never INSERT (migration
        # 0811375b3298 — "a fresh, unflagged job-position doesn't change the
        # chart's shape") — so this always returns None for a brand-new job,
        # even one created already-managerial/director. before_revision_id
        # is snapshotted after _apply_director_flag above on purpose: that
        # helper's clear_director() call DOES bump the revision (demoting
        # the *previous* director is a real structural change), and that
        # bump belongs to the job being demoted, not this route's own
        # capture — excluding it here avoids reporting someone else's
        # revision as "yours". Kept (rather than skipped) for symmetry with
        # api_update/api_delete below, and so this stays correct on its own
        # if the trigger definition ever changes.
        org_chart_revision = org_chart_service.capture_revision_delta(before_revision_id)
        return jsonify({
            'success': True, 'id': job_id, 'warning': warning, 'org_chart_revision': org_chart_revision,
        }), 201
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
    is_director = bool(data.get('is_director'))
    _check_single_manager(department_id, is_managerial, job_id=job_id)
    warning = _apply_director_flag(repo, is_director, job_id=job_id)

    # Snapshotted after _apply_director_flag, same reasoning as api_create
    # above — its clear_director() bump (if any) belongs to the *previous*
    # director's job, not this one.
    before_revision_id = OrgChartRevisionRepository().get_latest_id()
    try:
        repo.update(job_id, description, department_id, is_managerial, is_director)
        org_chart_revision = org_chart_service.capture_revision_delta(before_revision_id)
        return jsonify({'success': True, 'warning': warning, 'org_chart_revision': org_chart_revision})
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

    before_revision_id = OrgChartRevisionRepository().get_latest_id()
    try:
        deleted = repo.delete(job_id)
        if not deleted:
            raise NotFoundError('Stanowisko nie znalezione')
        org_chart_revision = org_chart_service.capture_revision_delta(before_revision_id)
        return jsonify({'success': True, 'org_chart_revision': org_chart_revision})
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
