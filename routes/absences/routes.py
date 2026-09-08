"""Absence management API — JSON only (this app has no server-rendered
templates; the SPA in frontend/ consumes every endpoint below).

self-service   GET/POST  /absences/api/my[...]
management     GET/POST  /absences/api/management, /absences/api/<id>/...
categories     GET/POST/PUT/DELETE /absences/api/categories[...]
approvers      GET/POST/DELETE /absences/api/workers/<worker_id>/approvers[...]
balances       GET  /absences/api/balances/summary, /absences/api/workers/<id>/balances
limits         POST/DELETE /absences/api/workers/<id>/limits[...]
adjustments    GET/POST/DELETE /absences/api/workers/<id>/adjustments[...]
audit          GET  /absences/api/workers/<id>/balance-audit
badge          GET  /absences/api/pending-count

Access model (see ab01absc0003_seed_absences_module_rbac.py): every role has
at least own_data access to 'absences' — self-service endpoints only need
module_permission_required('absences') + a linked worker. The management
endpoints (seeing/acting on someone else's request, categories, limits,
adjustments) additionally require absence_management_required: superadmin/
hr_manager, OR a worker registered as an approver for at least one other
worker (worker_absence_approvers) — independent of role, mirrors the golden
standard's own absence_management_required.
"""
import logging
from datetime import date, datetime
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

import services.worker_absence_balance_service as balance_service
import services.worker_absence_service as absence_service
from config.auth_config import module_permission_required
from exceptions import AppError, ValidationError
from repositories.absences.absence_approver_repository import WorkerAbsenceApproverRepository
from repositories.absences.absence_category_repository import WorkerAbsenceCategoryRepository
from repositories.audit_repository import AuditRepository
from repositories.workers.worker_repository import WorkerRepository

logger = logging.getLogger(__name__)

absences_bp = Blueprint('absences', __name__, url_prefix='/absences')


# ── helpers ───────────────────────────────────────────────────────────────────

def _current_worker_id():
    return getattr(current_user, 'worker_id', None) or None


def _is_admin() -> bool:
    return current_user.role in ('superadmin', 'hr_manager')


def _parse_date(value, *, field_label: str = 'data') -> date:
    if not value:
        raise ValidationError(f'Brakująca data: {field_label}')
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r}')


def _parse_time_opt(value):
    if not value:
        return None
    try:
        return datetime.strptime(value.strip()[:5], '%H:%M').time()
    except (ValueError, AttributeError):
        raise ValidationError(f'Nieprawidłowy format godziny: {value!r}')


def absence_management_required(f):
    """superadmin/hr_manager, OR a worker registered as an approver for at
    least one other worker. Independent of the 'absences' module's own_data
    role grant — approval capability is a per-relationship grant, not role-wide."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'success': False, 'error': 'Wymagane logowanie.'}), 401
        if _is_admin():
            return f(*args, **kwargs)
        worker_id = _current_worker_id()
        if worker_id and WorkerAbsenceApproverRepository().is_approver_for_anyone(worker_id):
            return f(*args, **kwargs)
        return jsonify({'success': False, 'error': 'Brak uprawnień do zarządzania nieobecnościami.'}), 403
    return decorated


def _absence_json(row: dict) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'worker_name': row.get('worker_name'),
        'category_id': row['category_id'],
        'category_name': row.get('category_name'),
        'absence_full_day': bool(row.get('absence_full_day', True)),
        'date_from': row['date_from'].isoformat() if hasattr(row['date_from'], 'isoformat') else row['date_from'],
        'date_to': row['date_to'].isoformat() if hasattr(row['date_to'], 'isoformat') else row['date_to'],
        'time_from': str(row['time_from'])[:5] if row.get('time_from') else None,
        'time_to': str(row['time_to'])[:5] if row.get('time_to') else None,
        'approver_worker_id': row.get('approver_worker_id'),
        'approver_name': row.get('approver_name'),
        'status': row['status'],
        'rejection_reason': row.get('rejection_reason'),
        'notes': row.get('notes'),
        'source': row['source'],
        'requested_at': row['requested_at'].isoformat() if row.get('requested_at') else None,
        'responded_at': row['responded_at'].isoformat() if row.get('responded_at') else None,
    }


def _category_json(row: dict) -> dict:
    return {
        'id': row['id'], 'name': row['name'], 'description': row.get('description'),
        'absence_full_day': bool(row['absence_full_day']), 'is_deleted': bool(row['is_deleted']),
        'is_tracked': bool(row['is_tracked']), 'count_period': row['count_period'],
        'resets_at': row.get('resets_at'), 'rolling_days': row.get('rolling_days'),
        'warning_threshold_pct': float(row['warning_threshold_pct']),
        'default_max_value': float(row['default_max_value']),
    }


# ── employee self-service ─────────────────────────────────────────────────────

@absences_bp.route('/api/my', methods=['GET'])
@module_permission_required('absences')
def my_absences():
    worker_id = _current_worker_id()
    if not worker_id:
        return jsonify({'success': False, 'error': 'Twoje konto nie jest przypisane do żadnego pracownika.'}), 400
    absences = absence_service.list_for_worker(worker_id)
    categories = WorkerAbsenceCategoryRepository().list_active()
    approvers = WorkerAbsenceApproverRepository().list_approvers_for(worker_id)
    return jsonify({
        'success': True,
        'absences': [_absence_json(a) for a in absences],
        'categories': [_category_json(c) for c in categories],
        'approvers': [
            {'worker_id': a['approver_worker_id'], 'full_name': f"{a['firstname']} {a['surname']}"}
            for a in approvers
        ],
        # Top of the hierarchy (jobs.is_director) has nobody to pick as
        # "Przełożony" — the frontend uses this to skip that field and submit
        # straight through (worker_absence_service.submit_request auto-
        # approves in that case, see WorkerRepository.is_director's docstring).
        'auto_approve': WorkerRepository().is_director(worker_id),
    })


@absences_bp.route('/api/my/preview-conflicts', methods=['GET'])
@login_required
def preview_conflicts():
    worker_id = _current_worker_id()
    if not worker_id:
        return jsonify({'success': False, 'error': 'Brak przypisanego pracownika'}), 403
    try:
        date_from = _parse_date(request.args.get('date_from'))
        date_to = _parse_date(request.args.get('date_to') or request.args.get('date_from'))
        time_from = _parse_time_opt(request.args.get('time_from'))
        time_to = _parse_time_opt(request.args.get('time_to'))
        conflicts = absence_service.preview_conflicts(worker_id, date_from, date_to, time_from, time_to)
        return jsonify({'success': True, 'conflicts': conflicts})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/my/submit', methods=['POST'])
@module_permission_required('absences')
def submit_request():
    worker_id = _current_worker_id()
    if not worker_id:
        return jsonify({'success': False, 'error': 'Twoje konto nie jest przypisane do żadnego pracownika.'}), 400
    data = request.get_json(silent=True) or {}
    try:
        absence_id = absence_service.submit_request(
            worker_id=worker_id,
            category_id=int(data['category_id']),
            date_from=_parse_date(data.get('date_from')),
            date_to=_parse_date(data.get('date_to') or data.get('date_from')),
            time_from=_parse_time_opt(data.get('time_from')),
            time_to=_parse_time_opt(data.get('time_to')),
            approver_worker_id=data.get('approver_worker_id') or None,
            notes=(data.get('notes') or '').strip() or None,
            created_by=current_user.id,
        )
        return jsonify({'success': True, 'id': absence_id}), 201
    except (AppError, KeyError, ValueError) as e:
        status = getattr(e, 'status_code', 400)
        msg = str(e) if not isinstance(e, KeyError) else f'Brakujące pole: {e}'
        return jsonify({'success': False, 'error': msg}), status


@absences_bp.route('/api/my/<int:absence_id>/cancel', methods=['POST'])
@module_permission_required('absences')
def cancel_own_request(absence_id: int):
    worker_id = _current_worker_id()
    if not worker_id:
        return jsonify({'success': False, 'error': 'Brak przypisanego pracownika'}), 403
    try:
        absence_service.cancel_own(absence_id, worker_id)
        return jsonify({'success': True})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/my/<int:absence_id>/cancel-approved', methods=['POST'])
@module_permission_required('absences')
def cancel_own_approved_request(absence_id: int):
    worker_id = _current_worker_id()
    if not worker_id:
        return jsonify({'success': False, 'error': 'Brak przypisanego pracownika'}), 403
    try:
        absence_service.cancel_own_approved(absence_id, worker_id)
        return jsonify({'success': True})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/pending-count', methods=['GET'])
@login_required
def pending_count():
    """Nav/dashboard badge — 0 for anyone who isn't an approver for anyone."""
    worker_id = _current_worker_id()
    if not worker_id:
        return jsonify({'success': True, 'count': 0})
    count = absence_service.count_pending_for_approver(worker_id) if (
        _is_admin() or WorkerAbsenceApproverRepository().is_approver_for_anyone(worker_id)
    ) else 0
    if _is_admin():
        count = len(absence_service.list_all(status_in=['pending']))
    return jsonify({'success': True, 'count': count})


# ── management (approver / HR) ────────────────────────────────────────────────

@absences_bp.route('/api/management', methods=['GET'])
@absence_management_required
def management_index():
    """Data for the 3-tab management view: pending/all requests + manual entries."""
    worker_id = _current_worker_id()
    if _is_admin():
        requests_list = absence_service.list_all(status_in=['pending', 'approved', 'rejected', 'cancelled'])
        manual_list = absence_service.list_all(status_in=['approved'])
    else:
        requests_list = absence_service.list_for_approver(worker_id) if worker_id else []
        manual_list = absence_service.list_all(status_in=['approved'], worker_id=worker_id) if worker_id else []

    categories = WorkerAbsenceCategoryRepository().list_with_deleted()
    pending_n = sum(1 for a in requests_list if a.get('status') == 'pending')
    return jsonify({
        'success': True,
        'requests': [_absence_json(a) for a in requests_list],
        'manual': [_absence_json(a) for a in manual_list if a.get('source') == 'manual'],
        'categories': [_category_json(c) for c in categories],
        'pending_count': pending_n,
    })


@absences_bp.route('/api/<int:absence_id>/approve', methods=['POST'])
@absence_management_required
def approve_request(absence_id: int):
    worker_id = _current_worker_id() if not _is_admin() else None
    try:
        absence_service.approve(absence_id, worker_id)
        return jsonify({'success': True, 'status': 'approved'})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/<int:absence_id>/reject', methods=['POST'])
@absence_management_required
def reject_request(absence_id: int):
    worker_id = _current_worker_id() if not _is_admin() else None
    data = request.get_json(silent=True) or {}
    try:
        absence_service.reject(absence_id, worker_id, (data.get('rejection_reason') or '').strip())
        return jsonify({'success': True, 'status': 'rejected'})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/<int:absence_id>/cancel-approved', methods=['POST'])
@absence_management_required
def cancel_approved_absence(absence_id: int):
    try:
        absence_service.cancel_approved(absence_id)
        return jsonify({'success': True, 'status': 'cancelled'})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/manual/worker-options', methods=['GET'])
@absence_management_required
def manual_worker_options():
    """Worker list for the "Dodaj ręcznie" form's "Pracownik" picker
    (AbsenceManagementPage). Deliberately scoped by who's asking rather than
    reusing /workers/api (module_permission_required('workers'), superadmin/
    hr_manager only) — a plain approver (registered in worker_absence_approvers
    for at least one worker, absence_management_required's non-admin branch)
    can reach this page too and must only see their own team, not the whole
    roster. Admin sees everyone active."""
    if _is_admin():
        rows = WorkerRepository().list_active_for_org_chart()
        workers = [{'id': r['id'], 'full_name': f"{r['firstname']} {r['surname']}"} for r in rows]
    else:
        worker_id = _current_worker_id()
        rows = WorkerAbsenceApproverRepository().list_subordinates_for(worker_id) if worker_id else []
        workers = [{'id': r['worker_id'], 'full_name': f"{r['firstname']} {r['surname']}"} for r in rows]
    return jsonify({'success': True, 'workers': workers})


@absences_bp.route('/api/manual', methods=['POST'])
@absence_management_required
def create_manual():
    data = request.get_json(silent=True) or {}
    creator_worker_id = _current_worker_id()
    try:
        worker_id = data['worker_id']
        if worker_id == creator_worker_id and not _is_admin():
            error = (
                'Nie możesz tworzyć manualnej nieobecności dla siebie. '
                'Złóż wniosek przez "Moje nieobecności".'
            )
            return jsonify({'success': False, 'error': error}), 403
        result = absence_service.create_manual(
            worker_id=worker_id,
            category_id=int(data['category_id']),
            date_from=_parse_date(data.get('date_from')),
            date_to=_parse_date(data.get('date_to') or data.get('date_from')),
            time_from=_parse_time_opt(data.get('time_from')),
            time_to=_parse_time_opt(data.get('time_to')),
            notes=(data.get('notes') or '').strip() or None,
            creator_worker_id=creator_worker_id,
            created_by=current_user.id,
        )
        return jsonify({'success': True, **result}), 201
    except (AppError, KeyError, ValueError) as e:
        status = getattr(e, 'status_code', 400)
        msg = str(e) if not isinstance(e, KeyError) else f'Brakujące pole: {e}'
        return jsonify({'success': False, 'error': msg}), status


@absences_bp.route('/api/<int:absence_id>', methods=['PUT'])
@absence_management_required
def update_absence(absence_id: int):
    data = request.get_json(silent=True) or {}
    try:
        absence_service.update_manual(
            absence_id,
            category_id=int(data['category_id']),
            date_from=_parse_date(data.get('date_from')),
            date_to=_parse_date(data.get('date_to') or data.get('date_from')),
            time_from=_parse_time_opt(data.get('time_from')),
            time_to=_parse_time_opt(data.get('time_to')),
            notes=(data.get('notes') or '').strip() or None,
        )
        return jsonify({'success': True})
    except (AppError, KeyError, ValueError) as e:
        status = getattr(e, 'status_code', 400)
        return jsonify({'success': False, 'error': str(e)}), status


@absences_bp.route('/api/<int:absence_id>', methods=['DELETE'])
@absence_management_required
def delete_absence(absence_id: int):
    try:
        absence_service.soft_delete(absence_id)
        return jsonify({'success': True})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


@absences_bp.route('/api/<int:absence_id>/permanent', methods=['DELETE'])
@absence_management_required
def hard_delete_absence(absence_id: int):
    if current_user.role != 'superadmin':
        return jsonify({'success': False, 'error': 'Tylko superadmin może trwale usuwać nieobecności'}), 403
    try:
        result = absence_service.hard_delete(absence_id)
        return jsonify({'success': True, **result})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


# ── categories (admin) ────────────────────────────────────────────────────────

def _parse_category_payload(data: dict) -> dict:
    def _bool(key, default=False):
        v = data.get(key, default)
        return v if isinstance(v, bool) else str(v).lower() in ('true', '1', 'yes')

    def _float(key, default=0.0):
        try:
            return float(data.get(key, default))
        except (ValueError, TypeError):
            return default

    def _int_opt(key):
        v = data.get(key)
        if v is None or v == '':
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    return {
        'absence_full_day': _bool('absence_full_day', True),
        'is_tracked': _bool('is_tracked', False),
        'count_period': data.get('count_period') or 'yearly',
        'resets_at': _int_opt('resets_at'),
        'rolling_days': _int_opt('rolling_days'),
        'warning_threshold_pct': _float('warning_threshold_pct', 0.80),
        'default_max_value': _float('default_max_value', 0.0),
    }


@absences_bp.route('/api/categories', methods=['GET'])
@module_permission_required('absences')
def list_categories():
    include_deleted = request.args.get('include_deleted', '').lower() in ('1', 'true')
    repo = WorkerAbsenceCategoryRepository()
    rows = repo.list_with_deleted() if include_deleted else repo.list_active()
    return jsonify({'success': True, 'categories': [_category_json(c) for c in rows]})


@absences_bp.route('/api/categories/tracked', methods=['GET'])
@module_permission_required('absences')
def tracked_categories():
    rows = WorkerAbsenceCategoryRepository().list_tracked()
    return jsonify({'success': True, 'categories': [_category_json(c) for c in rows]})


@absences_bp.route('/api/categories', methods=['POST'])
@absence_management_required
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Nazwa kategorii jest wymagana'}), 400
    fields = _parse_category_payload(data)
    try:
        new_id = WorkerAbsenceCategoryRepository().create(
            name=name, description=(data.get('description') or '').strip() or None, **fields,
        )
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        logger.exception('create_category failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/categories/<int:category_id>', methods=['PUT'])
@absence_management_required
def update_category(category_id: int):
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'Nazwa kategorii jest wymagana'}), 400
    fields = _parse_category_payload(data)
    updated = WorkerAbsenceCategoryRepository().update(
        category_id, name=name, description=(data.get('description') or '').strip() or None, **fields,
    )
    if not updated:
        return jsonify({'success': False, 'error': 'Kategoria nie istnieje'}), 404
    return jsonify({'success': True})


@absences_bp.route('/api/categories/<int:category_id>', methods=['DELETE'])
@absence_management_required
def delete_category(category_id: int):
    deleted = WorkerAbsenceCategoryRepository().soft_delete(category_id)
    if not deleted:
        return jsonify({'success': False, 'error': 'Kategoria nie istnieje lub już usunięta'}), 404
    return jsonify({'success': True})


@absences_bp.route('/api/categories/<int:category_id>/permanent', methods=['DELETE'])
@absence_management_required
def hard_delete_category(category_id: int):
    if current_user.role != 'superadmin':
        return jsonify({'success': False, 'error': 'Tylko superadmin może trwale usuwać kategorie'}), 403
    try:
        absence_service.hard_delete_category(category_id)
        return jsonify({'success': True})
    except AppError as e:
        return jsonify({'success': False, 'error': str(e)}), e.status_code


# ── approvers ─────────────────────────────────────────────────────────────────

@absences_bp.route('/api/workers/<worker_id>/approvers', methods=['GET'])
@absence_management_required
def list_approvers(worker_id: str):
    rows = WorkerAbsenceApproverRepository().list_approvers_for(worker_id)
    return jsonify({'success': True, 'approvers': [
        {'worker_id': r['approver_worker_id'], 'full_name': f"{r['firstname']} {r['surname']}"} for r in rows
    ]})


@absences_bp.route('/api/workers/<worker_id>/approvers', methods=['POST'])
@absence_management_required
def add_approver(worker_id: str):
    data = request.get_json(silent=True) or {}
    approver_worker_id = data.get('approver_worker_id')
    if not approver_worker_id:
        return jsonify({'success': False, 'error': 'approver_worker_id jest wymagany'}), 400
    if approver_worker_id == worker_id:
        return jsonify({'success': False, 'error': 'Pracownik nie może być swoim własnym przełożonym'}), 400
    try:
        WorkerAbsenceApproverRepository().add(worker_id, approver_worker_id)
        return jsonify({'success': True}), 201
    except Exception as e:
        logger.exception('add_approver failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/approvers/<approver_worker_id>', methods=['DELETE'])
@absence_management_required
def remove_approver(worker_id: str, approver_worker_id: str):
    removed = WorkerAbsenceApproverRepository().remove(worker_id, approver_worker_id)
    if not removed:
        return jsonify({'success': False, 'error': 'Powiązanie nie istnieje'}), 404
    return jsonify({'success': True})


# ── balances / limits / adjustments ──────────────────────────────────────────

@absences_bp.route('/api/balances/summary', methods=['GET'])
@absence_management_required
def balances_summary():
    try:
        summary = balance_service.get_balance_summary_for_list()
        return jsonify({'success': True, 'balances': summary})
    except Exception as e:
        logger.exception('balances_summary failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/balances', methods=['GET'])
@login_required
def worker_balances(worker_id: str):
    own_worker_id = _current_worker_id()
    is_own = own_worker_id == worker_id
    is_manager = _is_admin() or (
        own_worker_id and WorkerAbsenceApproverRepository().is_approver_for(worker_id, own_worker_id)
    )
    if not is_own and not is_manager:
        return jsonify({'success': False, 'error': 'Brak uprawnień'}), 403
    try:
        from repositories.workers.worker_repository import WorkerRepository
        balances = balance_service.get_all_balances_for_worker(worker_id)
        worker_row = WorkerRepository().get_by_id(worker_id)
        worker_name = f"{worker_row['firstname']} {worker_row['surname']}" if worker_row else worker_id
        return jsonify({'success': True, 'balances': balances, 'worker_name': worker_name})
    except Exception as e:
        logger.exception('worker_balances failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/limits', methods=['POST'])
@absence_management_required
def set_worker_limit(worker_id: str):
    data = request.get_json(silent=True) or {}
    try:
        category_id = int(data['category_id'])
        max_value = float(data['max_value'])
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({'success': False, 'error': f'Nieprawidłowe dane: {e}'}), 400
    if max_value < 0:
        return jsonify({'success': False, 'error': 'Limit nie może być ujemny'}), 400
    try:
        limit_id = balance_service.set_limit(
            worker_id=worker_id, category_id=category_id, max_value=max_value,
            notes=(data.get('notes') or '').strip() or None, created_by=current_user.id,
        )
        return jsonify({'success': True, 'id': limit_id}), 201
    except Exception as e:
        logger.exception('set_worker_limit failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/limits/<int:limit_id>', methods=['DELETE'])
@absence_management_required
def delete_worker_limit(worker_id: str, limit_id: int):
    try:
        balance_service.remove_limit(limit_id)
        return jsonify({'success': True})
    except Exception as e:
        logger.exception('delete_worker_limit failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/adjustments', methods=['GET'])
@absence_management_required
def list_worker_adjustments(worker_id: str):
    from repositories.absences.absence_adjustment_repository import WorkerAbsenceAdjustmentRepository
    rows = WorkerAbsenceAdjustmentRepository().list_for_worker(worker_id)
    def _fmt(r):
        created_at = r['created_at']
        return {
            'id': r['id'], 'category_name': r['category_name'], 'delta_value': float(r['delta_value']),
            'reason': r['reason'], 'period_label': r['period_label'],
            'created_at': created_at.isoformat() if hasattr(created_at, 'isoformat') else str(created_at),
            'created_by_name': r['created_by_name'],
        }
    return jsonify({'success': True, 'adjustments': [_fmt(r) for r in rows]})


@absences_bp.route('/api/workers/<worker_id>/adjustments', methods=['POST'])
@absence_management_required
def create_worker_adjustment(worker_id: str):
    data = request.get_json(silent=True) or {}
    try:
        category_id = int(data['category_id'])
        delta_value = float(data['delta_value'])
        reason = (data.get('reason') or '').strip()
    except (KeyError, ValueError, TypeError) as e:
        return jsonify({'success': False, 'error': f'Nieprawidłowe dane: {e}'}), 400
    if not reason:
        return jsonify({'success': False, 'error': 'Powód korekty jest wymagany'}), 400
    try:
        adj_id = balance_service.create_adjustment(
            worker_id=worker_id, category_id=category_id, delta_value=delta_value, reason=reason,
            period_label=(data.get('period_label') or '').strip() or None, created_by=current_user.id,
        )
        return jsonify({'success': True, 'id': adj_id}), 201
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        logger.exception('create_worker_adjustment failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/adjustments/<int:adj_id>', methods=['DELETE'])
@absence_management_required
def delete_worker_adjustment(worker_id: str, adj_id: int):
    try:
        balance_service.delete_adjustment(adj_id)
        return jsonify({'success': True})
    except Exception as e:
        logger.exception('delete_worker_adjustment failed')
        return jsonify({'success': False, 'error': str(e)}), 500


@absences_bp.route('/api/workers/<worker_id>/balance-audit', methods=['GET'])
@absence_management_required
def worker_balance_audit(worker_id: str):
    """Limit/adjustment change history for this worker. entity_label on both
    repos leads with the worker_id (see absence_limit_repository.py /
    absence_adjustment_repository.py), so filter on that rather than adding a
    bespoke AuditRepository method for one caller."""
    try:
        audit_repo = AuditRepository()
        rows = (
            audit_repo.get_all(entity_type='worker_absence_limit')
            + audit_repo.get_all(entity_type='worker_absence_adjustment')
        )
        entries = [r for r in rows if (r.get('entity_label') or '').startswith(worker_id)]
        entries.sort(key=lambda r: r['timestamp'] or '', reverse=True)
        return jsonify({'success': True, 'entries': entries})
    except Exception as e:
        logger.exception('worker_balance_audit failed')
        return jsonify({'success': False, 'error': str(e)}), 500
