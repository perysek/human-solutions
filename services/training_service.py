"""
services/training_service.py — IMPLEMENTATION_PLAN.md §10.

Walidacja domenowa szkoleń/uczestników i bramka własności trenera (TRN_7).
CRUD i audyt żyją w repozytoriach (repositories/trainings/) — ten moduł, tak
samo jak medical_service.py/bhp_service.py, tylko odrzuca złe dane i
wymusza, że `trainer` edytuje wyłącznie szkolenia, w których figuruje jako
trener, zanim cokolwiek trafi do repozytorium.
"""
from datetime import date
from typing import List, Optional

from config.auth_config import own_data_worker_id
from config.database import managed_transaction
from exceptions import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
import services.action_plan_service as action_plan_service
import services.worker_onboarding_service as worker_onboarding_service
from repositories.trainings.training_repository import TrainingRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.workers.worker_repository import WorkerRepository


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r} (oczekiwano RRRR-MM-DD)')


def _validate_training(description: str, training_details: Optional[str], related_docs: Optional[str]) -> None:
    if not description:
        raise ValidationError('Opis szkolenia jest wymagany')
    if not training_details:
        raise ValidationError('Szczegóły szkolenia są wymagane')
    if not related_docs:
        raise ValidationError('Dokumenty referencyjne są wymagane')


def create_training(payload: dict) -> int:
    description = (payload.get('description') or '').strip()
    remarks = (payload.get('remarks') or '').strip() or None
    training_date = _parse_date(payload.get('training_date'))
    related_docs = (payload.get('related_docs') or '').strip() or None
    training_details = (payload.get('training_details') or '').strip() or None
    _validate_training(description, training_details, related_docs)

    return TrainingRepository().create(
        description, remarks, training_date, related_docs, training_details,
    )


def update_training(training_id: int, payload: dict, user) -> None:
    """TRN_7 — `user` decides whether this is allowed at all: a role with
    full `trainings` access may edit any training; `trainer` only one it
    actually runs (assert_trainer_can_edit)."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    assert_trainer_can_edit(training_id, user)

    description = (payload.get('description') or '').strip()
    remarks = (payload.get('remarks') or '').strip() or None
    training_date = _parse_date(payload.get('training_date'))
    related_docs = (payload.get('related_docs') or '').strip() or None
    training_details = (payload.get('training_details') or '').strip() or None
    _validate_training(description, training_details, related_docs)

    TrainingRepository().update(
        training_id, description, remarks, training_date, related_docs, training_details,
    )


def delete_training(training_id: int) -> None:
    if not TrainingRepository().delete(training_id):
        raise NotFoundError('Szkolenie nie znalezione')


def assert_trainer_can_edit(training_id: int, user) -> None:
    """TRN_7: raises unless the caller has full (non-own_data) access to the
    `trainings` module, or is the trainer on at least one of this training's
    enrollments. Reused for TRN_8/9/11 (registering/editing a participant,
    exporting the roster) — all four actions share the same "you may only
    touch trainings you actually run" boundary."""
    owner_worker_id = own_data_worker_id(user, 'trainings')
    if owner_worker_id is None:
        return
    if not TrainingRepository().is_trainer_of(training_id, owner_worker_id):
        raise PermissionDeniedError('Możesz edytować wyłącznie szkolenia, w których figurujesz jako trener.')


def _validate_participant_dates(start_date: Optional[date], finish_date: Optional[date]) -> None:
    if start_date and finish_date and finish_date < start_date:
        raise ValidationError('Data zakończenia nie może być wcześniejsza niż data rozpoczęcia')


def register_participant(training_id: int, payload: dict, user) -> int:
    """TRN_8. Duplicate-safe: rejects a worker already enrolled (non-deleted)
    in this training before writing anything, and wraps the create +
    completion recalculation in one transaction so a failure partway (e.g.
    the idx_training_participants_training_worker_active constraint firing
    on a race between two concurrent requests that both passed the
    pre-check) leaves no partial row behind — either both writes land or
    neither does."""
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    assert_trainer_can_edit(training_id, user)

    worker_id = (payload.get('worker_id') or '').strip()
    if not worker_id:
        raise ValidationError('Identyfikator pracownika jest wymagany')
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    if TrainingParticipantRepository().exists_active(training_id, worker_id):
        raise ConflictError('Ten pracownik jest już zapisany na to szkolenie')

    start_date = _parse_date(payload.get('start_date'))
    finish_date = _parse_date(payload.get('finish_date'))
    _validate_participant_dates(start_date, finish_date)
    remarks = (payload.get('remarks') or '').strip() or None

    with managed_transaction():
        new_id = TrainingParticipantRepository().create(training_id, worker_id, start_date, finish_date, remarks)
        TrainingRepository().recalculate_completion(training_id)
    return new_id


def update_participant(participant_id: int, payload: dict, user) -> None:
    """TRN_8/9 — one endpoint updates start/finish/remarks/trainer AND
    effectiveness_date; see TrainingParticipantRepository.update's docstring
    for why this isn't split into two functions.

    Also the completion trigger for LUK_1's training-linked action plans:
    apply_training_effectiveness no-ops unless this save leaves both
    finish_date and effectiveness_date set, so it's safe to call
    unconditionally on every participant save rather than only when those
    two fields change. Same reasoning for recalculate_completion — it's a
    plain re-derivation from the current roster, safe to call on every
    save regardless of which fields actually changed."""
    repo = TrainingParticipantRepository()
    existing = repo.get_by_id(participant_id)
    if not existing:
        raise NotFoundError('Uczestnik nie znaleziony')
    assert_trainer_can_edit(existing['training_id'], user)

    start_date = _parse_date(payload.get('start_date'))
    finish_date = _parse_date(payload.get('finish_date'))
    _validate_participant_dates(start_date, finish_date)
    effectiveness_date = _parse_date(payload.get('effectiveness_date'))
    remarks = (payload.get('remarks') or '').strip() or None

    repo.update(participant_id, start_date, finish_date, remarks, effectiveness_date)
    TrainingRepository().recalculate_completion(existing['training_id'])
    action_plan_service.apply_training_effectiveness(participant_id)
    worker_onboarding_service.recalculate_if_onboarding(existing['worker_id'], existing['is_onboarding'])


def remove_participant(participant_id: int, user) -> None:
    """Uczestnicy — soft delete (row-hover delete icon on ParticipantsTable,
    before the edit icon). Same ownership gate as register/update_participant;
    recalculates `completion` afterward since the roster it's derived from
    just shrank."""
    repo = TrainingParticipantRepository()
    existing = repo.get_by_id(participant_id)
    if not existing:
        raise NotFoundError('Uczestnik nie znaleziony')
    assert_trainer_can_edit(existing['training_id'], user)

    deleted = repo.delete(participant_id)
    if deleted:
        TrainingRepository().recalculate_completion(existing['training_id'])
        worker_onboarding_service.recalculate_if_onboarding(existing['worker_id'], existing['is_onboarding'])


def list_worker_history(worker_id: str) -> List[dict]:
    """TRN_10."""
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    return TrainingParticipantRepository().get_by_worker(worker_id)
