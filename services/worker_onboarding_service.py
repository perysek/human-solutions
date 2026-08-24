"""
services/worker_onboarding_service.py — "Szkolenia wstępne" bulk-schedule
flow, reached from WorkerViewPage.

HR picks a subset of the trainings linked to the worker's job position
(`training_job`) on WorkerOnboardingTrainingsPage and schedules all of them
at once: the first selected training gets `start_date` = the date picker's
value, and each following one steps 7 days past the previous one's date
(+1 extra day if that lands on a Sunday). Each accepted training becomes a
`training_participants` row with `is_onboarding = TRUE` — same shape as
services/action_plan_service.py's training-linked action plan, including
calling TrainingParticipantRepository directly rather than through
training_service.register_participant: this is an HR-initiated bulk action
from the Workers module, not the `trainer`-scoped TRN_8 flow, so
assert_trainer_can_edit's ownership gate doesn't apply here.

A training the worker is already actively enrolled in (any non-deleted
`training_participants` row, onboarding or not) is silently skipped rather
than rejected — reopening this page later to add more trainings to an
in-progress plan is the expected use, not an error case.
"""
from datetime import date, timedelta
from typing import List, Optional

from config.database import managed_transaction
from exceptions import NotFoundError, ValidationError
from repositories.trainings.training_job_repository import TrainingJobRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_repository import TrainingRepository
from repositories.workers.worker_onboarding_repository import WorkerOnboardingRepository
from repositories.workers.worker_repository import WorkerRepository

SUNDAY = 6  # date.weekday(): Monday=0 ... Sunday=6


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r} (oczekiwano RRRR-MM-DD)')


def _next_onboarding_date(previous: date) -> date:
    """+7 days from the previous training's date; +1 more if that lands on
    a Sunday. Only the step is adjusted — the date-picker's own starting
    value is never shifted, since that's the user's explicit choice."""
    candidate = previous + timedelta(days=7)
    if candidate.weekday() == SUNDAY:
        candidate += timedelta(days=1)
    return candidate


def schedule_onboarding_trainings(worker_id: str, payload: dict) -> dict:
    """Returns {scheduled_count, skipped_count, start_date, end_date,
    participant_ids} — `end_date` is the max planned date among the
    trainings actually inserted (None if every selected training was
    already an active enrollment, i.e. scheduled_count == 0), which is what
    the frontend's success toast range is built from."""
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker:
        raise NotFoundError('Pracownik nie znaleziony')
    job_id = worker['job_id']
    if not job_id:
        raise ValidationError('Pracownik nie ma przypisanego stanowiska — brak programu szkoleń wstępnych')

    raw_ids = payload.get('training_ids') or []
    if not raw_ids:
        raise ValidationError('Wybierz co najmniej jedno szkolenie')

    start_date = _parse_date(payload.get('start_date'))
    if not start_date:
        raise ValidationError('Data rozpoczęcia jest wymagana')
    if start_date < date.today():
        raise ValidationError('Data rozpoczęcia nie może być wcześniejsza niż dzisiaj')

    valid_ids = TrainingJobRepository().training_ids_for_job(job_id)
    ordered_ids: List[int] = []
    seen = set()
    for raw_id in raw_ids:
        try:
            training_id = int(raw_id)
        except (TypeError, ValueError):
            raise ValidationError(f'Nieprawidłowy identyfikator szkolenia: {raw_id!r}')
        if training_id not in valid_ids:
            raise ValidationError('Wybrane szkolenie nie jest powiązane ze stanowiskiem pracownika')
        if training_id in seen:
            continue
        seen.add(training_id)
        ordered_ids.append(training_id)

    planned_dates = [start_date]
    for _ in range(1, len(ordered_ids)):
        planned_dates.append(_next_onboarding_date(planned_dates[-1]))

    participant_repo = TrainingParticipantRepository()
    training_repo = TrainingRepository()
    scheduled_ids: List[int] = []
    scheduled_dates: List[date] = []

    with managed_transaction():
        for training_id, planned_date in zip(ordered_ids, planned_dates):
            if participant_repo.exists_active(training_id, worker_id):
                continue
            new_id = participant_repo.create(
                training_id, worker_id, start_date=planned_date, finish_date=None, remarks=None,
                is_onboarding=True,
            )
            training_repo.recalculate_completion(training_id)
            scheduled_ids.append(new_id)
            scheduled_dates.append(planned_date)

        if scheduled_ids:
            WorkerOnboardingRepository().recalculate(worker_id, job_id)

    return {
        'scheduled_count': len(scheduled_ids),
        'skipped_count': len(ordered_ids) - len(scheduled_ids),
        'start_date': start_date,
        'end_date': max(scheduled_dates) if scheduled_dates else None,
        'participant_ids': scheduled_ids,
    }


def recalculate_if_onboarding(worker_id: str, is_onboarding: bool) -> None:
    """Called after every training_participants save/delete that might
    touch an onboarding-flagged row (services/training_service.py's
    update_participant/remove_participant, both of which already have the
    row's `is_onboarding`/`worker_id` in hand from a pre-write fetch — no
    re-fetch by participant id here, since remove_participant's soft delete
    would make that fetch return None and silently no-op the recalc it's
    meant to trigger). No-ops for a plain (non-onboarding) enrollment or a
    worker with no job_id, same "safe to call unconditionally" shape as
    action_plan_service.apply_training_effectiveness."""
    if not is_onboarding:
        return
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker or not worker['job_id']:
        return
    WorkerOnboardingRepository().recalculate(worker_id, worker['job_id'])
