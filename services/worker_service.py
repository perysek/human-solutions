"""
services/worker_service.py — IMPLEMENTATION_PLAN.md §7.

Orkiestruje operacje na profilu pracownika przez cztery repozytoria
(workers, birth_data, worker_nationality, foreigner_data) wewnątrz jednej
managed_transaction() — ERR_1 dosłownie: błąd w dowolnym kroku wycofuje
wszystkie już wykonane wstawienia/aktualizacje z tego żądania.
"""
from datetime import date
from typing import Optional

from config.database import managed_transaction
from exceptions import NotFoundError, ValidationError
from repositories.jobs.job_repository import JobRepository
from repositories.workers.birth_data_repository import BirthDataRepository
from repositories.workers.foreigner_data_repository import ForeignerDataRepository
from repositories.workers.worker_nationality_repository import WorkerNationalityRepository
from repositories.workers.worker_repository import WorkerRepository

VALID_GENDERS = ('Male', 'Female', 'UNKNOWN')


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

    boss_id = payload.get('boss_id')
    if boss_id and not WorkerRepository().get_by_id(boss_id):
        raise NotFoundError(f'Przełożony o id "{boss_id}" nie istnieje')


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
        foreigner.get(k) for k in ('document_kind', 'document_validity', 'employment_basis', 'employment_basis_validity')
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
            boss_id=payload.get('boss_id') or None,
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
    if payload.get('boss_id') == worker_id:
        raise ValidationError('Pracownik nie może być swoim własnym przełożonym')

    with managed_transaction():
        WorkerRepository().update(
            worker_id,
            firstname=payload['firstname'].strip(),
            surname=payload['surname'].strip(),
            job_id=payload.get('job_id') or None,
            boss_id=payload.get('boss_id') or None,
            gender=payload.get('gender') or 'UNKNOWN',
            hire_date=_parse_date(payload.get('hire_date')),
        )
        _apply_personal_data(worker_id, payload, is_update=True)


def get_worker_profile(worker_id: str) -> Optional[dict]:
    """Combined profile (WRK_2-5): base worker fields (+ job/boss labels,
    joined by WorkerRepository) plus birth data, nationality list, and
    foreigner document, in one payload."""
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker:
        return None

    return {
        'worker': worker,
        'birth': BirthDataRepository().get_by_worker(worker_id),
        'nationalities': WorkerNationalityRepository().get_by_worker(worker_id),
        'foreigner': ForeignerDataRepository().get_by_worker(worker_id),
    }
