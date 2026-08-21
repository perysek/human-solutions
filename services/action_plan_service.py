"""
services/action_plan_service.py — LUK_1's "Szkolenie" checkbox.

The gap-report "plan działania" modal has two creation modes now: a plain
free-text corrective action (unchanged, still validated inline in
routes/workers/routes.py for now — see create_action_plan's else branch)
or a training-linked one, where checking "Szkolenie" replaces the whole
form with a training picker + an expected skill-rating increase. Picking a
training auto-enrolls the worker (a training_participants row) — this
module is where that atomic two-table write happens, same
managed_transaction pattern as services/worker_service.py.

apply_training_effectiveness() is the other half: called from
services/training_service.update_participant() every time a participant
row is saved (that endpoint already backs the existing TRN_8/9 "edit
uczestnika" UI — no new screen needed for the completion step). Once an
enrollment has both finish_date and effectiveness_date set, any
not-yet-applied training-linked action plan for that exact enrollment gets
its worker_skill bumped by expected_increase (capped at 3, the schema-wide
rating ceiling) and flips to status='effective'.
"""
from datetime import date

from config.database import managed_transaction
from exceptions import NotFoundError, ValidationError
from repositories.skills.skill_repository import SkillRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_repository import TrainingRepository
from repositories.workers.action_plan_repository import ActionPlanRepository
from repositories.workers.worker_repository import WorkerRepository
from repositories.workers.worker_skill_repository import WorkerSkillRepository

MAX_SKILL_RATING = 3  # worker_skills.current_rating's schema-wide ceiling (check_worker_skills_current_rating)


def _parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f'Nieprawidłowy format daty: {value!r} (oczekiwano RRRR-MM-DD)')


def _create_training_action_plan(
    *, worker_id: str, skill_id: str, training_id: int, expected_increase, training_start_date,
) -> int:
    if expected_increase not in (1, 2, 3):
        raise ValidationError('Oczekiwany wzrost musi wynosić 1, 2 lub 3')
    if not training_start_date:
        raise ValidationError('Planowana data szkolenia jest wymagana')
    training = TrainingRepository().get_by_id(training_id)
    if not training:
        raise NotFoundError('Szkolenie nie znalezione')

    # Auto-derived, since the training-mode form collects only the training
    # + planned date + expected increase — description still has to satisfy
    # action_plans' NOT NULL description column, so it's filled from the
    # training itself rather than left for the user to type. planned_date
    # mirrors the user-chosen training_start_date — the same date becomes
    # this enrollment's start_date below, so the plan's "planned for" and
    # the enrollment's "starts on" can't drift apart at creation.
    description = f"Szkolenie: {training['description']}"

    with managed_transaction():
        # Direct repository call, not training_service.register_participant():
        # that helper's assert_trainer_can_edit gate exists for the trainer
        # role editing their own roster from the Trainings module — this is
        # an HR-initiated side effect of raising a corrective action from
        # the Workers module gap report, a different actor and boundary.
        participant_id = TrainingParticipantRepository().create(
            training_id, worker_id, start_date=training_start_date, finish_date=None, remarks=None, trainer_id=None,
        )
        # register_participant() (the normal TRN_8 path) triggers this same
        # recalculation itself — this call bypasses that helper (see above),
        # so it has to trigger it directly instead.
        TrainingRepository().recalculate_completion(training_id)
        return ActionPlanRepository().create(
            worker_id=worker_id, skill_id=skill_id, description=description,
            responsible_id=None, planned_date=training_start_date, status='defined',
            is_training=True, training_id=training_id,
            training_participant_id=participant_id, expected_increase=expected_increase,
        )


def create_action_plan(payload: dict) -> int:
    """LUK_1 — raise a corrective action against one worker's competency gap
    on one skill. Branches on `is_training`; the plain-mode branch keeps
    living inline in the route for now (it predates this module and isn't
    being touched here) — routes/workers/routes.py's api_create_action_plan
    only calls into this module for the training branch."""
    worker_id = (payload.get('worker_id') or '').strip()
    skill_id = (payload.get('skill_id') or '').strip()
    if not worker_id or not skill_id:
        raise ValidationError('Pracownik i umiejętność są wymagane')
    if not WorkerRepository().get_by_id(worker_id):
        raise NotFoundError('Pracownik nie znaleziony')
    if not SkillRepository().get_by_id(skill_id):
        raise NotFoundError('Umiejętność nie znaleziona')

    training_id = payload.get('training_id')
    if not training_id:
        raise ValidationError('Szkolenie jest wymagane')
    training_start_date = _parse_date(payload.get('training_start_date'))

    return _create_training_action_plan(
        worker_id=worker_id, skill_id=skill_id,
        training_id=int(training_id), expected_increase=payload.get('expected_increase'),
        training_start_date=training_start_date,
    )


def apply_training_effectiveness(participant_id: int) -> None:
    """Called after every training_participants save (services.training_service
    .update_participant). No-ops unless this enrollment now has both
    finish_date and effectiveness_date — "completed AND effectiveness
    confirmed" is the exact gate the feature was specced with — and there's
    at least one training-linked action plan still waiting on it
    (get_pending_training_actions already excludes ones already applied,
    making this safe to call on every save, not just the one that sets the
    second date)."""
    participant = TrainingParticipantRepository().get_by_id(participant_id)
    if not participant or not participant['finish_date'] or not participant['effectiveness_date']:
        return

    pending = ActionPlanRepository().get_pending_training_actions(participant_id)
    for plan in pending:
        with managed_transaction():
            current = WorkerSkillRepository().get_one(plan['worker_id'], plan['skill_id'])
            current_rating = (current['current_rating'] if current else None) or 0
            new_rating = min(current_rating + plan['expected_increase'], MAX_SKILL_RATING)
            WorkerSkillRepository().set_rating(
                plan['worker_id'], plan['skill_id'], new_rating, last_update=participant['effectiveness_date'],
            )
            ActionPlanRepository().mark_training_effective(
                plan['id'], completed_date=participant['finish_date'], effectiveness_date=participant['effectiveness_date'],
            )
