"""
services/worker_service.py — IMPLEMENTATION_PLAN.md §7.

Orkiestruje operacje na profilu pracownika przez cztery repozytoria
(workers, birth_data, worker_nationality, foreigner_data) wewnątrz jednej
managed_transaction() — ERR_1 dosłownie: błąd w dowolnym kroku wycofuje
wszystkie już wykonane wstawienia/aktualizacje z tego żądania.
"""
from datetime import date, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta

from config.database import managed_transaction
from exceptions import ConflictError, NotFoundError, ValidationError
from repositories.jobs.job_repository import JobRepository
from repositories.workers.birth_data_repository import BirthDataRepository
from repositories.workers.foreigner_data_repository import ForeignerDataRepository
from repositories.workers.worker_nationality_repository import WorkerNationalityRepository
from repositories.workers.worker_repository import WorkerRepository
from repositories.workers.worker_termination_repository import WorkerTerminationRepository

VALID_GENDERS = ('Male', 'Female', 'UNKNOWN')

# "Złożenie wypowiedzenia" default okres wypowiedzenia, by tenure at
# submission_date — Kodeks pracy's usual 2-tygodnie/1-miesiąc/3-miesiące
# tiers, expressed as fixed day counts (matching the product decision to
# always store/compute this in whole days, not calendar-month boundaries).
NOTICE_TIER_1_DAYS = 14  # < 6 miesięcy zatrudnienia
NOTICE_TIER_2_DAYS = 30  # 6 miesięcy - 3 lata
NOTICE_TIER_3_DAYS = 90  # >= 3 lata
# The stepper only ever decreases by 5 days, floored at 0 — see
# _valid_notice_period_values.
NOTICE_STEP_DAYS = 5


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r} (oczekiwano RRRR-MM-DD)')


def _validate_common(payload: dict) -> None:
    if not (payload.get('firstname') or '').strip() or not (payload.get('surname') or '').strip():
        raise ValidationError('Imię i nazwisko są wymagane')

    gender = payload.get('gender') or 'UNKNOWN'
    if gender not in VALID_GENDERS:
        raise ValidationError(f'Nieprawidłowa płeć: {gender!r} (dozwolone: {", ".join(VALID_GENDERS)})')

    job_id = payload.get('job_id')
    if job_id and not JobRepository().get_by_id(job_id):
        raise NotFoundError(f'Stanowisko "{job_id}" nie istnieje')


def _apply_personal_data(worker_id: str, payload: dict, *, is_update: bool) -> None:
    """Shared birth/nationality/foreigner write logic for create and update
    — the only difference is that update() clears foreigner_data outright
    when the section is submitted empty (a worker stopped being a
    foreigner / the entry was wrong), while create() simply skips writing
    a row that was never sent."""
    birth_repo = BirthDataRepository()
    nationality_repo = WorkerNationalityRepository()
    foreigner_repo = ForeignerDataRepository()

    birth_date = _parse_date(payload.get('birth_date'))
    birth_place = (payload.get('birth_place') or '').strip() or None
    if birth_date or birth_place:
        birth_repo.upsert(worker_id, birth_date, birth_place)

    nationalities = payload.get('nationalities') or []
    if nationalities or is_update:
        nationality_repo.replace_all(worker_id, nationalities)

    foreigner = payload.get('foreigner') or {}
    has_foreigner_data = any(
        foreigner.get(k)
        for k in ('document_kind', 'document_validity', 'employment_basis', 'employment_basis_validity')
    )
    if has_foreigner_data:
        foreigner_repo.upsert(
            worker_id,
            document_kind=(foreigner.get('document_kind') or '').strip() or None,
            document_validity=_parse_date(foreigner.get('document_validity')),
            employment_basis=(foreigner.get('employment_basis') or '').strip() or None,
            employment_basis_validity=_parse_date(foreigner.get('employment_basis_validity')),
        )
    elif is_update:
        foreigner_repo.delete_by_worker(worker_id)


def create_worker(payload: dict) -> str:
    """WRK_6. Validates, then writes workers + birth_data + worker_nationality
    + foreigner_data atomically."""
    _validate_common(payload)

    with managed_transaction():
        worker_id = WorkerRepository().create(
            firstname=payload['firstname'].strip(),
            surname=payload['surname'].strip(),
            job_id=payload.get('job_id') or None,
            gender=payload.get('gender') or 'UNKNOWN',
            hire_date=_parse_date(payload.get('hire_date')),
        )
        _apply_personal_data(worker_id, payload, is_update=False)

    return worker_id


def update_worker(worker_id: str, payload: dict) -> None:
    """WRK_7. Same validation + atomic multi-table write as create_worker,
    against an existing worker."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')

    _validate_common(payload)

    with managed_transaction():
        WorkerRepository().update(
            worker_id,
            firstname=payload['firstname'].strip(),
            surname=payload['surname'].strip(),
            job_id=payload.get('job_id') or None,
            gender=payload.get('gender') or 'UNKNOWN',
            hire_date=_parse_date(payload.get('hire_date')),
        )
        _apply_personal_data(worker_id, payload, is_update=True)


def get_worker_profile(worker_id: str) -> Optional[dict]:
    """Combined profile (WRK_2-5): base worker fields (+ job/boss labels,
    joined by WorkerRepository) plus birth data, nationality list,
    foreigner document, and the worker's pending notice of termination (if
    any — see WorkerTerminationRepository), in one payload."""
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker:
        return None

    return {
        'worker': worker,
        'birth': BirthDataRepository().get_by_worker(worker_id),
        'nationalities': WorkerNationalityRepository().get_by_worker(worker_id),
        'foreigner': ForeignerDataRepository().get_by_worker(worker_id),
        'pending_termination': WorkerTerminationRepository().get_pending_by_worker(worker_id),
    }


# ─── Notice of termination ("Złożenie wypowiedzenia") ──────────────────────

def compute_default_notice_period_days(hire_date: Optional[date], submission_date: date) -> int:
    """Kodeks-pracy-derived default okres wypowiedzenia for a worker whose
    tenure (hire_date -> submission_date) falls into one of three tiers.
    `hire_date` missing (never recorded) falls back to the shortest tier
    (14 days) — the safe default since it's the one the UI can't
    accidentally under-shoot (it can only ever be decreased further, never
    raised back up)."""
    if hire_date is None:
        return NOTICE_TIER_1_DAYS
    tenure = relativedelta(submission_date, hire_date)
    if tenure.years >= 3:
        return NOTICE_TIER_3_DAYS
    if tenure.years >= 1 or tenure.months >= 6:
        return NOTICE_TIER_2_DAYS
    return NOTICE_TIER_1_DAYS


def _valid_notice_period_values(default_days: int) -> set:
    """The exact set of values the -5-day, floor-0 stepper can land on,
    starting from `default_days` — e.g. default=14 -> {14, 9, 4, 0} (the
    last step clamps short of a full -5 once it would go negative).
    Re-derived server-side so the API never trusts a client-computed
    notice_period_days it can't independently verify."""
    values = set()
    v = default_days
    while v > 0:
        values.add(v)
        v -= NOTICE_STEP_DAYS
    values.add(0)
    return values


def get_termination_default(worker_id: str, submission_date: Optional[date] = None) -> dict:
    """Powers the modal's initial pre-fill — computed server-side (single
    source of truth for the tenure tiers) rather than duplicated in JS."""
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker:
        raise NotFoundError('Pracownik nie znaleziony')
    sub_date = submission_date or date.today()
    default_days = compute_default_notice_period_days(worker['hire_date'], sub_date)
    return {
        'submission_date': sub_date,
        'default_notice_period_days': default_days,
        'planned_fire_date': sub_date + timedelta(days=default_days),
    }


def submit_termination(worker_id: str, payload: dict) -> int:
    """The 'Dezaktywuj' button's new target: records a notice of
    termination instead of setting fire_date immediately. fire_date only
    gets set once planned_fire_date is reached — see
    finalize_due_terminations."""
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker:
        raise NotFoundError('Pracownik nie znaleziony')
    if worker['fire_date'] is not None:
        raise ValidationError('Pracownik jest już nieaktywny')
    if WorkerTerminationRepository().get_pending_by_worker(worker_id):
        raise ConflictError('Pracownik ma już złożone wypowiedzenie — najpierw poczekaj na jego zakończenie.')

    submission_date = _parse_date(payload.get('submission_date'))
    if not submission_date:
        raise ValidationError('Data złożenia jest wymagana')
    if submission_date > date.today():
        raise ValidationError('Data złożenia nie może być późniejsza niż dzisiaj')

    reason = (payload.get('reason') or '').strip()
    if not reason:
        raise ValidationError('Przyczyna złożenia jest wymagana')

    default_days = compute_default_notice_period_days(worker['hire_date'], submission_date)

    raw_notice_period = payload.get('notice_period_days')
    if raw_notice_period is None:
        raise ValidationError('Okres wypowiedzenia jest wymagany')
    try:
        notice_period_days = int(raw_notice_period)
    except (TypeError, ValueError):
        raise ValidationError('Okres wypowiedzenia musi być liczbą całkowitą dni')
    if notice_period_days not in _valid_notice_period_values(default_days):
        raise ValidationError('Nieprawidłowy okres wypowiedzenia')

    shortening_reason = (payload.get('shortening_reason') or '').strip() or None
    if notice_period_days < default_days:
        if not shortening_reason:
            raise ValidationError('Przyczyna skrócenia okresu jest wymagana, gdy okres wypowiedzenia jest skrócony')
    else:
        shortening_reason = None

    planned_fire_date = submission_date + timedelta(days=notice_period_days)

    with managed_transaction():
        return WorkerTerminationRepository().create(
            worker_id=worker_id, submission_date=submission_date, reason=reason,
            notice_period_days=notice_period_days, default_notice_period_days=default_days,
            shortening_reason=shortening_reason, planned_fire_date=planned_fire_date,
        )


def finalize_due_terminations() -> int:
    """Lazy "auto" transition: promotes every pending notice whose
    planned_fire_date has been reached into an actual fire_date on
    `workers`, and marks the notice 'finalized'. This app runs a single
    Gunicorn worker with no background scheduler (config/runtime_guards.py),
    so there is no cron ticking this over at midnight — instead, every
    read path that surfaces worker/dashboard status calls this first
    (api_list, api_get, dashboard summary/alerts, the termination
    endpoints), so nobody sees a stale 'aktywny' badge past the planned
    date by more than one page load. Idempotent — WorkerRepository.set_fire_date's
    `fire_date IS NULL` guard makes a concurrent double-run harmless."""
    due = WorkerTerminationRepository().get_due(date.today())
    for row in due:
        with managed_transaction():
            WorkerRepository().set_fire_date(row['worker_id'], row['planned_fire_date'])
            WorkerTerminationRepository().finalize(row['id'])
    return len(due)
