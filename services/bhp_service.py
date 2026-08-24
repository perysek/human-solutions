"""
services/bhp_service.py — IMPLEMENTATION_PLAN.md §9.

Walidacja domenowa szkoleń BHP: enum `kind` i porządek dat (`valid_until
>= training_date`, gdy oba podane). Struktura identyczna do
medical_service.py — patrz jej docstring dla podziału odpowiedzialności
względem BhpTrainingRepository.
"""
from datetime import date
from typing import List, Optional

from exceptions import NotFoundError, ValidationError
from repositories.bhp.bhp_training_repository import BhpTrainingRepository
from repositories.workers.worker_repository import WorkerRepository

VALID_KINDS = ('Initial', 'Periodic', 'Control')


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r} (oczekiwano RRRR-MM-DD)')


def _validate(training_date: Optional[date], valid_until: Optional[date], kind: str) -> None:
    if kind not in VALID_KINDS:
        raise ValidationError(f"Rodzaj szkolenia musi być jednym z: {', '.join(VALID_KINDS)}")
    if not training_date:
        raise ValidationError('Data szkolenia jest wymagana')
    if valid_until and valid_until < training_date:
        raise ValidationError('Data ważności nie może być wcześniejsza niż data szkolenia')


def list_for_worker(worker_id: str) -> List[dict]:
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    return BhpTrainingRepository().get_all_for_worker(worker_id)


def create_training(worker_id: str, payload: dict) -> int:
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')

    training_date = _parse_date(payload.get('training_date'))
    valid_until = _parse_date(payload.get('valid_until'))
    kind = payload.get('kind')
    _validate(training_date, valid_until, kind)

    return BhpTrainingRepository().create(worker_id, training_date, valid_until, kind)


def update_training(training_id: int, payload: dict) -> None:
    if not BhpTrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')

    training_date = _parse_date(payload.get('training_date'))
    valid_until = _parse_date(payload.get('valid_until'))
    kind = payload.get('kind')
    _validate(training_date, valid_until, kind)

    BhpTrainingRepository().update(training_id, training_date, valid_until, kind)


def delete_training(training_id: int) -> None:
    if not BhpTrainingRepository().delete(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
