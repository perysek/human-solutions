"""
services/medical_service.py — IMPLEMENTATION_PLAN.md §9.

Walidacja domenowa badań lekarskich: enum `kind` i porządek dat
(`valid_until >= performed_on`, gdy oba podane). CRUD i audyt żyją w
MedicalExamRepository — ten moduł tylko odrzuca złe dane, zanim do niej
trafią (ten sam podział odpowiedzialności co worker_service.py).
"""
from datetime import date
from typing import List, Optional

from exceptions import NotFoundError, ValidationError
from repositories.medical.medical_exam_repository import MedicalExamRepository
from repositories.workers.worker_repository import WorkerRepository

VALID_KINDS = ('Preliminary', 'Periodic')


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r} (oczekiwano RRRR-MM-DD)')


def _validate(performed_on: Optional[date], valid_until: Optional[date], kind: str) -> None:
    if kind not in VALID_KINDS:
        raise ValidationError(f"Rodzaj badania musi być jednym z: {', '.join(VALID_KINDS)}")
    if not performed_on:
        raise ValidationError('Data badania jest wymagana')
    if valid_until and valid_until < performed_on:
        raise ValidationError('Data ważności nie może być wcześniejsza niż data badania')


def list_for_worker(worker_id: str) -> List[dict]:
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    return MedicalExamRepository().get_all_for_worker(worker_id)


def create_exam(worker_id: str, payload: dict) -> int:
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')

    performed_on = _parse_date(payload.get('performed_on'))
    valid_until = _parse_date(payload.get('valid_until'))
    kind = payload.get('kind')
    description = (payload.get('description') or '').strip() or None
    _validate(performed_on, valid_until, kind)

    return MedicalExamRepository().create(worker_id, description, performed_on, valid_until, kind)


def update_exam(exam_id: int, payload: dict) -> None:
    if not MedicalExamRepository().get_by_id(exam_id):
        raise NotFoundError('Badanie nie znalezione')

    performed_on = _parse_date(payload.get('performed_on'))
    valid_until = _parse_date(payload.get('valid_until'))
    kind = payload.get('kind')
    description = (payload.get('description') or '').strip() or None
    _validate(performed_on, valid_until, kind)

    MedicalExamRepository().update(exam_id, description, performed_on, valid_until, kind)


def delete_exam(exam_id: int) -> None:
    if not MedicalExamRepository().delete(exam_id):
        raise NotFoundError('Badanie nie znalezione')
