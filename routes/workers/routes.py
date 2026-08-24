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
from datetime import date

from flask import Blueprint, jsonify, request
from flask_login import login_required

import services.action_plan_service as action_plan_service
import services.competency_service as competency_service
import services.worker_onboarding_service as worker_onboarding_service
import services.worker_service as worker_service
from config.auth_config import module_permission_required
from exceptions import AppError, ConflictError, NotFoundError, ValidationError
from repositories.audit_repository import AuditRepository
from repositories.skills.skill_repository import SkillRepository
from repositories.workers.action_plan_repository import ActionPlanRepository
from repositories.workers.worker_repository import WorkerRepository
from repositories.workers.worker_skill_remark_repository import WorkerSkillRemarkRepository
from repositories.workers.worker_skill_repository import WorkerSkillRepository
from services.alert_service import get_expiring_foreigner_docs

# LUK_1/LUK_2 — the 4 status values the "plan działania" modal + tracking
# page allow. Kept as the raw enum strings the frontend already uses (no
# translation layer) — see ActionPlanModal.tsx's ActionPlanStatus type.
_ACTION_PLAN_STATUSES = {'defined', 'in_progress', 'completed', 'effective'}
# task — 'at most one OPEN plan per (worker, skill)' guard: which of the 4
# statuses above count as "still open" (matches
# ActionPlanRepository.get_open_plan's own SQL and the partial unique
# index's predicate, migration d1e2f3a4b5c6).
_OPEN_ACTION_PLAN_STATUSES = {'defined', 'in_progress'}


def _parse_date(value, *, field_label: str):
    """'YYYY-MM-DD' -> date, or None. Action plan dates must go in as real
    `date` objects, not raw strings — ActionPlanRepository.update() diffs
    the new value against the DB's `date` object to decide what to audit,
    and `date(...) != '2026-09-15'` is always True regardless of content,
    which would log a spurious "changed" audit row on every single save."""
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {field_label}')

workers_bp = Blueprint('workers', __name__, url_prefix='/workers')


def _worker_json(row) -> dict:
    return {
        'id': row['id'],
        'firstname': row['firstname'],
        'surname': row['surname'],
        'full_name': f"{row['firstname']} {row['surname']}",
        'job_id': row['job_id'],
        'job_description': row.get('job_description'),
        'job_is_managerial': bool(row.get('job_is_managerial')),
        'department_id': row.get('department_id'),
        'department_name': row.get('department_name'),
        # Only present on rows from WorkerRepository.get_all (api_list, task3) —
        # get_by_id/get_subordinates/get_by_job don't compute it.
        'needs_attention': bool(row.get('needs_attention', False)),
        # Derived, not stored (see WorkerRepository._BASE_COLUMNS) — the
        # worker(s) holding the is_managerial job in this worker's own job's
        # department, comma-joined if more than one holds it, None if their
        # job has no department or that department has no manager assigned.
        'boss_name': row.get('boss_name'),
        # "Szkolenia wstępne" (worker_onboarding_status, joined by job_id —
        # see WorkerRepository._FROM_CLAUSE). Both None = "Nie zaplanowane"
        # (never bulk-scheduled for this worker's current job); otherwise
        # `onboarding_completed` picks "Zakończone"/"W trakcie" and
        # `onboarding_completion_pct` is that badge's own %.
        'onboarding_completed': row.get('onboarding_completed'),
        'onboarding_completion_pct': row.get('onboarding_completion_pct'),
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
        'employment_basis_validity': (
            foreigner['employment_basis_validity'].isoformat() if foreigner['employment_basis_validity'] else None
        ),
    } if foreigner else None
    pending = profile['pending_termination']
    out['pending_termination'] = _termination_json(pending) if pending else None
    return out


def _termination_json(row) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'worker_name': f"{row['firstname']} {row['surname']}",
        'submission_date': row['submission_date'].isoformat() if row['submission_date'] else None,
        'reason': row['reason'],
        'notice_period_days': row['notice_period_days'],
        'default_notice_period_days': row['default_notice_period_days'],
        'shortening_reason': row['shortening_reason'],
        'planned_fire_date': row['planned_fire_date'].isoformat() if row['planned_fire_date'] else None,
        'status': row['status'],
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
    }


# ─── API Endpoints ────────────────────────────────────────────────────────────

@workers_bp.route('/api', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_list():
    """GET /workers/api?status=&search=&needs_attention=&sort=&order=&page=&page_size= — WRK_1/WRK_11."""
    try:
        worker_service.finalize_due_terminations()
        status = request.args.get('status') or None
        search = request.args.get('search') or None
        needs_attention = request.args.get('needs_attention') or None
        sort = request.args.get('sort') or None
        order = request.args.get('order') or 'asc'
        page = max(int(request.args.get('page', 1)), 1)
        page_size = min(max(int(request.args.get('page_size', 25)), 1), 200)

        rows, total = WorkerRepository().get_all(
            status=status, search=search, needs_attention=needs_attention,
            sort=sort, order=order, page=page, page_size=page_size,
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


@workers_bp.route('/api/needs-attention-summary', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_needs_attention_summary():
    """GET /workers/api/needs-attention-summary — task2's stat cards atop
    WorkersListPage. `total` is the literal sum of the three category
    counts (a worker in two categories at once counts toward `total`
    twice, same as it counts toward two separate cards) — this is a sum of
    issues, not a count of distinct flagged workers."""
    try:
        counts = WorkerRepository().count_needs_attention_by_category()
        counts['total'] = counts['gap_count'] + counts['medical_count'] + counts['bhp_count']
        return jsonify(counts)
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_needs_attention_summary (workers)')
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
        worker_service.finalize_due_terminations()
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


@workers_bp.route('/api/<worker_id>/termination-default', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_termination_default(worker_id):
    """GET /workers/api/<id>/termination-default?submission_date= — pre-fill
    for the "Złożenie wypowiedzenia" modal: the Kodeks-pracy-tier default
    okres wypowiedzenia (and the fire date it implies) for this worker as
    of `submission_date` (defaults to today)."""
    try:
        submission_date = _parse_date(request.args.get('submission_date'), field_label='Data złożenia') or None
        result = worker_service.get_termination_default(worker_id, submission_date)
        return jsonify({
            'submission_date': result['submission_date'].isoformat(),
            'default_notice_period_days': result['default_notice_period_days'],
            'planned_fire_date': result['planned_fire_date'].isoformat(),
        })
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_termination_default (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/<worker_id>/termination', methods=['POST'])
@login_required
@module_permission_required('workers')
def api_submit_termination(worker_id):
    """POST /workers/api/<id>/termination — "Złożenie wypowiedzenia": the
    'Dezaktywuj' button's new target. Records a notice of termination;
    workers.fire_date is only set once planned_fire_date is actually
    reached (finalize_due_terminations, evaluated lazily on read — this
    app has no background scheduler)."""
    data = request.get_json() or {}
    try:
        new_id = worker_service.submit_termination(worker_id, data)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_submit_termination (workers)')
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


# ─── "Szkolenia wstępne" (onboarding trainings bulk-schedule) ─────────────────

@workers_bp.route('/api/<worker_id>/onboarding-trainings/schedule', methods=['POST'])
@login_required
@module_permission_required('workers')
def api_schedule_onboarding_trainings(worker_id):
    """POST /workers/api/<id>/onboarding-trainings/schedule — body:
    {training_ids: [...], start_date: 'YYYY-MM-DD'}. Bulk-enrolls the worker
    into every selected training (already scoped to their job's curriculum
    by WorkerOnboardingTrainingsPage's own GET /trainings/api?job_id=&worker_id=
    call — services.worker_onboarding_service re-validates that scope
    server-side), stepping each training's planned start date +7 days past
    the previous one (+1 if that lands on a Sunday). Trainings the worker is
    already actively enrolled in are skipped, not rejected — see that
    module's docstring."""
    data = request.get_json() or {}
    try:
        result = worker_onboarding_service.schedule_onboarding_trainings(worker_id, data)
        return jsonify({
            'success': True,
            'scheduled_count': result['scheduled_count'],
            'skipped_count': result['skipped_count'],
            'start_date': result['start_date'].isoformat(),
            'end_date': result['end_date'].isoformat() if result['end_date'] else None,
            'participant_ids': result['participant_ids'],
        })
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_schedule_onboarding_trainings (workers)')
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
            {
                'id': r['id'], 'remarks': r['remarks'],
                'created_at': r['created_at'].isoformat() if r['created_at'] else None,
            }
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


@workers_bp.route('/api/<worker_id>/skills/<skill_id>/rating-history', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_skill_rating_history(worker_id, skill_id):
    """GET /workers/api/<id>/skills/<skill_id>/rating-history — SKL_5's
    full history of this one skill's rating changes for this worker,
    including the automatic bumps LUK_1's "Szkolenie" checkbox applies once
    a linked training's effectiveness is confirmed
    (services.action_plan_service.apply_training_effectiveness). Reads the
    same audit_log rows WorkerSkillRepository.set_rating() writes
    (entity_type='worker', field_name='current_rating') — no separate
    history table, per this app's established "audit_log is the history"
    convention (see ActionPlanRepository's own docstring)."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    try:
        rows = AuditRepository().get_all(
            entity_type='worker', entity_id=worker_id, field_name='current_rating', label=skill_id,
        )
        events = [
            {
                'id': r['id'],
                'action': r['action'],
                'old_value': r['old_value'],
                'new_value': r['new_value'],
                'user_name': r['user_name'],
                'timestamp': r['timestamp'].isoformat() if r['timestamp'] else None,
            }
            for r in rows
        ]
        return jsonify({'events': events, 'count': len(events)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_skill_rating_history (workers)')
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
                'job_description': r['job_description'],
                'boss_name': r['boss_name'],
                'skill_id': r['skill_id'],
                'skill_description': r['skill_description'],
                'required_rating': r['required_rating'],
                'current_rating': r['current_rating'],
                'gap': r['gap'],
                'last_update': r['last_update'].isoformat() if r['last_update'] else None,
                'action_plan_id': r['action_plan_id'],
                'action_description': r['action_description'],
                'action_planned_date': r['action_planned_date'].isoformat() if r['action_planned_date'] else None,
                'action_status': r['action_status'],
                'action_is_training': r['action_is_training'],
                'action_training_description': r['action_training_description'],
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


# ─── Action plans (LUK_1/LUK_2) ────────────────────────────────────────────

def _action_plan_json(row) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'worker_name': f"{row['worker_firstname']} {row['worker_surname']}",
        'skill_id': row['skill_id'],
        'skill_description': row['skill_description'],
        'description': row['description'],
        'responsible_id': row['responsible_id'],
        'responsible_name': (
            f"{row['responsible_firstname']} {row['responsible_surname']}"
            if row['responsible_firstname'] else None
        ),
        'planned_date': row['planned_date'].isoformat() if row['planned_date'] else None,
        'completed_date': row['completed_date'].isoformat() if row['completed_date'] else None,
        'effectiveness_date': row['effectiveness_date'].isoformat() if row['effectiveness_date'] else None,
        'status': row['status'],
        'is_training': row['is_training'],
        'training_id': row['training_id'],
        'training_description': row['training_description'],
        'expected_increase': row['expected_increase'],
        'skill_increase_applied': row['skill_increase_applied'],
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


@workers_bp.route('/api/action-plans', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_list_action_plans():
    """GET /workers/api/action-plans?status=&worker_id= — LUK_2 tracking list."""
    try:
        status = request.args.get('status') or None
        if status and status not in _ACTION_PLAN_STATUSES:
            raise ValidationError('Nieprawidłowy status')
        worker_id = request.args.get('worker_id') or None
        rows = ActionPlanRepository().get_all(status=status, worker_id=worker_id)
        results = [_action_plan_json(r) for r in rows]
        return jsonify({'results': results, 'count': len(results)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list_action_plans (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/action-plans/<int:action_plan_id>', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_get_action_plan(action_plan_id):
    """GET /workers/api/action-plans/<id> — single plan, full shape. Used by
    CompetencyGapsReportPage to open the edit form (not the empty create
    form) for a gap row that already has a plan — the list endpoint's
    `action_plan_id` alone isn't enough to pre-fill the modal."""
    row = ActionPlanRepository().get_by_id(action_plan_id)
    if not row:
        raise NotFoundError('Plan działania nie znaleziony')
    try:
        return jsonify(_action_plan_json(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_action_plan (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/action-plans', methods=['POST'])
@login_required
@module_permission_required('workers')
def api_create_action_plan():
    """POST /workers/api/action-plans — LUK_1: raise a corrective action
    against one worker's competency gap on one skill. Two shapes share this
    endpoint: `is_training: true` (the gap report's "Szkolenie" checkbox —
    picks an internal training + expected rating increase, auto-enrolls the
    worker, and is handled by services.action_plan_service so it can share
    a transaction with the training_participants insert) or the plain
    free-text corrective action (still validated inline here)."""
    data = request.get_json() or {}

    if data.get('is_training'):
        try:
            new_id = action_plan_service.create_action_plan(data)
            return jsonify({'success': True, 'id': new_id}), 201
        except AppError:
            raise
        except Exception:
            logging.exception('Unexpected error in api_create_action_plan (workers, training)')
            raise AppError('Wystąpił błąd serwera')

    worker_id = (data.get('worker_id') or '').strip()
    skill_id = (data.get('skill_id') or '').strip()
    description = (data.get('description') or '').strip()
    responsible_id = (data.get('responsible_id') or '').strip() or None
    planned_date = _parse_date(data.get('planned_date'), field_label='Planowana data')
    status = data.get('status') or 'defined'

    if not worker_id or not skill_id:
        raise ValidationError('Pracownik i umiejętność są wymagane')
    if not description:
        raise ValidationError('Opis działania jest wymagany')
    if not responsible_id:
        raise ValidationError('Odpowiedzialny jest wymagany')
    if not planned_date:
        raise ValidationError('Planowana data jest wymagana')
    if planned_date < date.today():
        raise ValidationError('Planowana data nie może być wcześniejsza niż dzisiaj')
    if status not in _ACTION_PLAN_STATUSES:
        raise ValidationError('Nieprawidłowy status')
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    if not SkillRepository().get_by_id(skill_id):
        raise NotFoundError('Umiejętność nie znaleziona')
    if not WorkerRepository().get_by_id(responsible_id):
        raise NotFoundError('Odpowiedzialny pracownik nie znaleziony')
    if status in _OPEN_ACTION_PLAN_STATUSES:
        conflict = ActionPlanRepository().get_open_plan(worker_id, skill_id)
        if conflict:
            raise ConflictError(
                f'Pracownik ma już otwarty plan działania dla tej umiejętności ("{conflict["description"]}") '
                '— najpierw go zakończ lub usuń.'
            )

    try:
        new_id = ActionPlanRepository().create(
            worker_id=worker_id, skill_id=skill_id, description=description,
            responsible_id=responsible_id, planned_date=planned_date, status=status,
        )
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create_action_plan (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/action-plans/<int:action_plan_id>', methods=['PUT'])
@login_required
@module_permission_required('workers')
def api_update_action_plan(action_plan_id):
    """PUT /workers/api/action-plans/<id> — LUK_2: edit description/
    responsible/dates/status. Per-field old/new goes to audit_log inside
    ActionPlanRepository.update()."""
    existing = ActionPlanRepository().get_by_id(action_plan_id)
    if not existing:
        raise NotFoundError('Plan działania nie znaleziony')

    data = request.get_json() or {}
    description = (data.get('description') or '').strip()
    responsible_id = (data.get('responsible_id') or '').strip() or None
    planned_date = _parse_date(data.get('planned_date'), field_label='Planowana data')
    status = data.get('status') or 'defined'
    completed_date = _parse_date(data.get('completed_date'), field_label='Data zakończenia')
    effectiveness_date = _parse_date(data.get('effectiveness_date'), field_label='Data oceny skuteczności')

    if not description:
        raise ValidationError('Opis działania jest wymagany')
    if not responsible_id:
        raise ValidationError('Odpowiedzialny jest wymagany')
    if not planned_date:
        raise ValidationError('Planowana data jest wymagana')
    # Only enforced when the caller actually changed the date — an existing
    # plan's planned_date may legitimately already be in the past (e.g.
    # still "w trakcie" from last week); editing an unrelated field on it
    # shouldn't be blocked by a date nobody touched.
    if planned_date != existing['planned_date'] and planned_date < date.today():
        raise ValidationError('Planowana data nie może być wcześniejsza niż dzisiaj')
    if status not in _ACTION_PLAN_STATUSES:
        raise ValidationError('Nieprawidłowy status')
    if completed_date and completed_date > date.today():
        raise ValidationError('Data zakończenia nie może być późniejsza niż dzisiaj')
    created_date = existing['created_at'].date() if existing['created_at'] else None
    if completed_date and created_date and completed_date < created_date:
        raise ValidationError('Data zakończenia nie może być wcześniejsza niż data utworzenia planu')
    if effectiveness_date and completed_date and effectiveness_date < completed_date:
        raise ValidationError('Data oceny skuteczności nie może być wcześniejsza niż data zakończenia')
    if not WorkerRepository().get_by_id(responsible_id):
        raise NotFoundError('Odpowiedzialny pracownik nie znaleziony')
    if status in _OPEN_ACTION_PLAN_STATUSES:
        conflict = ActionPlanRepository().get_open_plan(
            existing['worker_id'], existing['skill_id'], exclude_id=action_plan_id,
        )
        if conflict:
            raise ConflictError(
                f'Pracownik ma już inny otwarty plan działania dla tej umiejętności ("{conflict["description"]}") '
                '— najpierw go zakończ lub usuń.'
            )

    try:
        ActionPlanRepository().update(
            action_plan_id, description=description, responsible_id=responsible_id,
            planned_date=planned_date, status=status,
            completed_date=completed_date, effectiveness_date=effectiveness_date,
        )
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update_action_plan (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/action-plans/<int:action_plan_id>', methods=['DELETE'])
@login_required
@module_permission_required('workers')
def api_delete_action_plan(action_plan_id):
    """DELETE /workers/api/action-plans/<id> — soft delete (is_deleted/
    deleted_at, migration e5f6a7b8c9d0): the "Plany działań" table's
    row-hover delete icon. Not a hard delete — see ActionPlanRepository's
    docstring on why a plan (possibly linked to a real training enrollment)
    keeps its history instead of vanishing."""
    try:
        deleted = ActionPlanRepository().delete(action_plan_id)
        if not deleted:
            raise NotFoundError('Plan działania nie znaleziony')
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete_action_plan (workers)')
        raise AppError('Wystąpił błąd serwera')


@workers_bp.route('/api/action-plans/<int:action_plan_id>/history', methods=['GET'])
@login_required
@module_permission_required('workers')
def api_action_plan_history(action_plan_id):
    """GET /workers/api/action-plans/<id>/history — full per-field audit
    trail for one action plan (every UPDATE that changed something, plus
    its CREATE), newest first."""
    if not ActionPlanRepository().get_by_id(action_plan_id):
        raise NotFoundError('Plan działania nie znaleziony')
    try:
        rows = AuditRepository().get_all(entity_type='action_plan', entity_id=action_plan_id)
        events = [
            {
                'id': r['id'],
                'action': r['action'],
                'field_name': r['field_name'],
                'old_value': r['old_value'],
                'new_value': r['new_value'],
                'user_name': r['user_name'],
                'timestamp': r['timestamp'].isoformat() if r['timestamp'] else None,
            }
            for r in rows
        ]
        return jsonify({'events': events, 'count': len(events)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_action_plan_history (workers)')
        raise AppError('Wystąpił błąd serwera')
