"""services/worker_absence_balance_service.py

Balance snapshot / limit / adjustment logic — ported near-verbatim from the
golden standard's AbsenceBalanceService (this logic is domain-agnostic, no
appointment/salon concepts involved).
"""
from datetime import date, timedelta
from typing import Dict, List, Optional

from config.database import managed_transaction
from repositories.absences.absence_adjustment_repository import WorkerAbsenceAdjustmentRepository
from repositories.absences.absence_balance_repository import WorkerAbsenceBalanceRepository
from repositories.absences.absence_category_repository import WorkerAbsenceCategoryRepository
from repositories.absences.absence_limit_repository import WorkerAbsenceLimitRepository


def _balance_repo() -> WorkerAbsenceBalanceRepository:
    return WorkerAbsenceBalanceRepository()


def _limit_repo() -> WorkerAbsenceLimitRepository:
    return WorkerAbsenceLimitRepository()


def _adjustment_repo() -> WorkerAbsenceAdjustmentRepository:
    return WorkerAbsenceAdjustmentRepository()


def _category_repo() -> WorkerAbsenceCategoryRepository:
    return WorkerAbsenceCategoryRepository()


# ── period calculation ───────────────────────────────────────────────────────

def compute_period_start(count_period: str, resets_at: Optional[int], rolling_days: Optional[int]) -> date:
    """Start date of the current accounting period."""
    today = date.today()
    if count_period == 'yearly':
        day_offset = (resets_at or 1) - 1
        reset = date(today.year, 1, 1) + timedelta(days=day_offset)
        if today >= reset:
            return reset
        return date(today.year - 1, 1, 1) + timedelta(days=day_offset)
    elif count_period == 'monthly':
        day = min(resets_at or 1, 28)
        if today.day >= day:
            return date(today.year, today.month, day)
        if today.month == 1:
            return date(today.year - 1, 12, day)
        return date(today.year, today.month - 1, day)
    else:  # 'rolling'
        return today - timedelta(days=rolling_days or 365)


def _period_label(count_period: str, period_start: date) -> str:
    if count_period == 'yearly':
        return str(period_start.year)
    elif count_period == 'monthly':
        return period_start.strftime('%Y-%m')
    return f'rolling {period_start.isoformat()}'


# ── balance snapshot ──────────────────────────────────────────────────────────

def get_balance(worker_id: str, category_id: int) -> dict:
    """Full balance snapshot for a worker+category pair. Raises ValueError if
    the category doesn't exist or isn't tracked."""
    cat_row = _category_repo().get_by_id(category_id)
    if not cat_row:
        raise ValueError(f'Kategoria {category_id} nie istnieje')
    if not bool(cat_row['is_tracked']):
        raise ValueError(f"Kategoria '{cat_row['name']}' nie ma włączonego śledzenia")

    full_day = bool(cat_row['absence_full_day'])
    period_start = compute_period_start(cat_row['count_period'], cat_row['resets_at'], cat_row['rolling_days'])

    used = _balance_repo().compute_used(worker_id, category_id, period_start, full_day)
    adjustments = _balance_repo().compute_adjustments(worker_id, category_id)
    net_used = used + adjustments

    limit_row = _limit_repo().get_for_worker_category(worker_id, category_id)
    limit = float(limit_row['max_value']) if limit_row else float(cat_row['default_max_value'])
    has_limit = limit > 0.0

    warning_pct = float(cat_row['warning_threshold_pct'])
    pct = (net_used / limit * 100.0) if has_limit else 0.0

    if not has_limit:
        status = 'unlimited'
    elif net_used > limit:
        status = 'exceeded'
    elif net_used >= limit * warning_pct:
        status = 'warning'
    else:
        status = 'ok'

    return {
        'category_id': category_id, 'category_name': cat_row['name'],
        'absence_full_day': full_day, 'unit': 'days' if full_day else 'hours',
        'used': round(used, 2), 'adjustments': round(adjustments, 2), 'net_used': round(net_used, 2),
        'limit': limit, 'default_max_value': float(cat_row['default_max_value']), 'has_limit': has_limit,
        'pct': round(pct, 2), 'warning_threshold_pct': warning_pct, 'status': status,
        'period_start': period_start.isoformat(), 'period_label': _period_label(cat_row['count_period'], period_start),
    }


def get_all_balances_for_worker(worker_id: str) -> List[dict]:
    result = []
    for cat_row in _category_repo().list_tracked():
        try:
            result.append(get_balance(worker_id, cat_row['id']))
        except ValueError:
            pass
    return result


def get_balance_summary_for_list() -> Dict[str, dict]:
    """{worker_id -> primary_balance_dict} for the worker list's balance column."""
    rows = _balance_repo().bulk_summary_for_list()
    result: Dict[str, dict] = {}
    for row in rows:
        w_id, cat_id = row['worker_id'], row['category_id']
        full_day = bool(row['full_day'])
        lim = float(row['lim'])
        adj = float(row['adj_total'])
        warning_pct = float(row['warning_threshold_pct'])
        try:
            cat_row = _category_repo().get_by_id(cat_id)
            if not cat_row:
                continue
            period_start = compute_period_start(cat_row['count_period'], cat_row['resets_at'], cat_row['rolling_days'])
            used = _balance_repo().compute_used(w_id, cat_id, period_start, full_day)
        except Exception:
            used = 0.0

        net_used = used + adj
        has_limit = lim > 0.0
        pct = (net_used / lim * 100.0) if has_limit else 0.0
        if not has_limit:
            status = 'unlimited'
        elif net_used > lim:
            status = 'exceeded'
        elif net_used >= lim * warning_pct:
            status = 'warning'
        else:
            status = 'ok'

        result[w_id] = {
            'category_id': cat_id, 'category_name': row['category_name'],
            'unit': 'days' if full_day else 'hours', 'used': round(net_used, 2),
            'limit': lim, 'pct': round(pct, 2), 'status': status,
        }
    return result


# ── limit management ──────────────────────────────────────────────────────────

def set_limit(*, worker_id: str, category_id: int, max_value: float,
              notes: Optional[str], created_by: Optional[int]) -> int:
    with managed_transaction():
        return _limit_repo().upsert(
            worker_id=worker_id, category_id=category_id, max_value=max_value,
            notes=notes, created_by=created_by,
        )


def remove_limit(limit_id: int) -> None:
    with managed_transaction():
        _limit_repo().soft_delete(limit_id)


# ── adjustments ────────────────────────────────────────────────────────────────

def create_adjustment(*, worker_id: str, category_id: int, delta_value: float,
                       reason: str, period_label: Optional[str], created_by: Optional[int]) -> int:
    if not reason or not reason.strip():
        raise ValueError('Powód korekty jest wymagany')
    with managed_transaction():
        return _adjustment_repo().create(
            worker_id=worker_id, category_id=category_id, delta_value=delta_value,
            reason=reason.strip(), period_label=period_label, created_by=created_by,
        )


def delete_adjustment(adj_id: int) -> None:
    with managed_transaction():
        _adjustment_repo().soft_delete(adj_id)


# ── pre-submission check ────────────────────────────────────────────────────────

def check_before_submit(worker_id: str, category_id: int, proposed_value: float, source: str) -> dict:
    """source='request' -> hard block if over limit; source='manual' -> soft warning only.
    Returns {ok, blocked, warning, message, balance}."""
    cat_row = _category_repo().get_by_id(category_id)
    if not cat_row or not bool(cat_row['is_tracked']):
        return {'ok': True, 'blocked': False, 'warning': False, 'message': '', 'balance': None}

    try:
        balance = get_balance(worker_id, category_id)
    except ValueError:
        return {'ok': True, 'blocked': False, 'warning': False, 'message': '', 'balance': None}

    if not balance['has_limit']:
        return {'ok': True, 'blocked': False, 'warning': False, 'message': '', 'balance': balance}

    net_used_after = balance['net_used'] + proposed_value
    limit = balance['limit']
    unit = 'dni' if balance['absence_full_day'] else 'godzin'
    warning_pct = balance['warning_threshold_pct']

    if net_used_after > limit:
        over = net_used_after - limit
        msg = (
            f"Limit {balance['category_name']}: {balance['net_used']:.1f}/{limit} {unit}. "
            f"Proponowana nieobecność ({proposed_value:.1f} {unit}) przekroczy limit o {over:.1f} {unit}."
        )
        blocked = (source == 'request')
        return {'ok': not blocked, 'blocked': blocked, 'warning': True, 'message': msg, 'balance': balance}

    if net_used_after >= limit * warning_pct:
        msg = (
            f"Uwaga: po tej nieobecności wykorzystano by {net_used_after:.1f}/{limit} {unit} "
            f"({net_used_after / limit * 100:.0f}% limitu)."
        )
        return {'ok': True, 'blocked': False, 'warning': True, 'message': msg, 'balance': balance}

    return {'ok': True, 'blocked': False, 'warning': False, 'message': '', 'balance': balance}
