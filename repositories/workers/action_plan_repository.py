"""
Repository dla planów działań korygujących lukę kompetencyjną (action_plans,
LUK_1). Jeden wiersz na działanie podjęte wobec konkretnej luki (worker_id +
skill_id) — patrz migracja c3d4e5f6a7b8 po uzasadnienie kolumn/FK, oraz
d4e5f6a7b8c9 dla szkoleniowego wariantu (is_training/training_id/
training_participant_id/expected_increase/skill_increase_applied).

Audytowane pod audit_entity_type='action_plan' z entity_id=action_plans.id
(nie worker_id, w przeciwieństwie do worker_skills) — to *ten plan* jest tu
encją śledzoną, nie pracownik, którego dotyczy. update() audytuje każde
zmienione pole osobno (stara/nowa wartość, wzorem
WorkerSkillRepository.set_rating) zamiast jednego zbiorczego zdarzenia
UPDATE — to jest "pełna historia" z jaką ten model został zbudowany:
GET /workers/api/action-plans/<id>/history czyta te wiersze wprost z
audit_log (routes/workers/routes.py, przez AuditRepository.get_all).
"""
from datetime import date
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT ap.id, ap.worker_id, w.firstname AS worker_firstname, w.surname AS worker_surname,
           ap.skill_id, s.description AS skill_description,
           ap.description, ap.responsible_id,
           r.firstname AS responsible_firstname, r.surname AS responsible_surname,
           ap.planned_date, ap.completed_date, ap.effectiveness_date, ap.status,
           ap.is_training, ap.training_id, t.description AS training_description,
           ap.training_participant_id, ap.expected_increase, ap.skill_increase_applied,
           ap.created_at, ap.updated_at
    FROM action_plans ap
    JOIN workers w ON w.id = ap.worker_id
    JOIN skills s ON s.id = ap.skill_id
    LEFT JOIN workers r ON r.id = ap.responsible_id
    LEFT JOIN trainings t ON t.id = ap.training_id
"""

# The 6 caller-mutable columns update() tracks for per-field audit history —
# kept as one tuple so the "did anything change" loop and the UPDATE's SET
# list can't silently drift apart.
_MUTABLE_FIELDS = ('description', 'responsible_id', 'planned_date', 'status', 'completed_date', 'effectiveness_date')

# The fields mark_training_effective() flips when a training-linked plan's
# enrollment is confirmed complete+effective — a separate tuple from
# _MUTABLE_FIELDS because it's driven by the training_participants edit
# flow (services/action_plan_service.apply_training_effectiveness), not by
# the "plan działania" edit form.
_TRAINING_COMPLETION_FIELDS = ('status', 'completed_date', 'effectiveness_date', 'skill_increase_applied')


class ActionPlanRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'action_plan'
    _soft_delete = True  # delete() below rides BaseRepository's is_deleted/deleted_at UPDATE

    def __init__(self):
        super().__init__('action_plans')

    def get_all(self, status: Optional[str] = None, worker_id: Optional[str] = None) -> List[Any]:
        """LUK_2 — every action plan, optionally filtered. Open plans
        (anything short of 'effective') sort first, then by planned_date —
        the tracking page's default view is "what still needs attention",
        not a chronological log. Soft-deleted plans never appear (the
        table's own overridden query, not BaseRepository.get_all — this
        repo's get_all/get_by_id are custom joins, so the exclusion has to
        be repeated here rather than inherited)."""
        conditions = ['NOT ap.is_deleted']
        params: list = []
        if status:
            conditions.append('ap.status = %s')
            params.append(status)
        if worker_id:
            conditions.append('ap.worker_id = %s')
            params.append(worker_id)
        where = f" WHERE {' AND '.join(conditions)}"
        query = _SELECT + where + " ORDER BY (ap.status = 'effective'), ap.planned_date, ap.id DESC"
        return self._fetch_all(query, tuple(params))

    def get_by_id(self, action_plan_id: int) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE ap.id = %s AND NOT ap.is_deleted", (action_plan_id,))
        return rows[0] if rows else None

    def get_open_plan(self, worker_id: str, skill_id: str, exclude_id: Optional[int] = None) -> Optional[Any]:
        """'At most one OPEN plan per (worker, skill)' guard — 'open' means
        status not yet completed/effective (defined/in_progress). A worker
        can accumulate any number of RESOLVED historical plans for the same
        skill over time (that's the audit trail LUK_2 was built for); only
        one may be actively in flight. Backed by the partial unique index
        idx_action_plans_one_open_per_worker_skill (migration d1e2f3a4b5c6)
        — this method is what lets the route give a friendly Polish
        ConflictError instead of only surfacing a raw IntegrityError."""
        query = (
            "SELECT id, description FROM action_plans WHERE worker_id = %s AND skill_id = %s "
            "AND NOT is_deleted AND status IN ('defined', 'in_progress')"
        )
        params: list = [worker_id, skill_id]
        if exclude_id is not None:
            query += " AND id != %s"
            params.append(exclude_id)
        return self._fetch_one(query, tuple(params))

    def get_overdue(self) -> List[Any]:
        """Pulpit's "Działania do luk kompetencji" alert (Faza 7) — open
        plans (status defined/in_progress — same 'open' definition
        get_open_plan's one-open-plan-per-gap guard uses) whose planned_date
        has passed. A plan already 'completed'/'effective' isn't "zaległe"
        even with a past planned_date — it got done, just not necessarily on
        schedule, so this deliberately doesn't reuse get_all's broader
        "not is_deleted" scope alone."""
        return self._fetch_all(
            _SELECT + " WHERE NOT ap.is_deleted AND ap.status IN ('defined', 'in_progress') "
            "AND ap.planned_date < CURRENT_DATE ORDER BY ap.planned_date ASC"
        )

    def delete(self, action_plan_id: int) -> bool:
        """Soft-delete (BaseRepository.delete() with _soft_delete=True sets
        is_deleted/deleted_at rather than removing the row) + an explicit
        DELETE audit entry — AuditableMixin's _audit isn't called by the
        inherited delete(), only by methods this repo defines itself."""
        existing = self.get_by_id(action_plan_id)
        if not existing:
            return False
        deleted = super().delete(action_plan_id)
        if deleted:
            self._audit('DELETE', action_plan_id, label=existing['description'])
        return deleted

    def create(
        self, *, worker_id: str, skill_id: str, description: str,
        responsible_id: Optional[str], planned_date: date, status: str = 'defined',
        is_training: bool = False, training_id: Optional[int] = None,
        training_participant_id: Optional[int] = None, expected_increase: Optional[int] = None,
    ) -> int:
        new_id = self._execute_insert(
            "INSERT INTO action_plans (worker_id, skill_id, description, responsible_id, planned_date, status, "
            "is_training, training_id, training_participant_id, expected_increase) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (worker_id, skill_id, description, responsible_id, planned_date, status,
             is_training, training_id, training_participant_id, expected_increase),
        )
        self._audit('CREATE', new_id, label=description)
        return new_id

    def get_pending_training_actions(self, training_participant_id: int) -> List[Any]:
        """Training-linked plans raised against one specific enrollment that
        haven't had their skill increase applied yet — what
        services.action_plan_service.apply_training_effectiveness() acts on
        once that enrollment's finish_date + effectiveness_date are both
        set. Scoped to training_participant_id (not just worker+training)
        so re-enrolling the same worker in the same training later can't
        pick up an already-settled plan. Excludes soft-deleted plans — a
        deleted plan shouldn't still bump the worker's skill rating."""
        return self._fetch_all(
            _SELECT + " WHERE ap.training_participant_id = %s AND ap.is_training "
            "AND NOT ap.skill_increase_applied AND NOT ap.is_deleted",
            (training_participant_id,),
        )

    def mark_training_effective(self, action_plan_id: int, *, completed_date: date, effectiveness_date: date) -> None:
        """Flips a training-linked plan to 'effective' once its enrollment's
        completion + effectiveness are confirmed and the skill bump has been
        applied (caller's responsibility — see apply_training_effectiveness,
        which calls this in the same managed_transaction as the
        WorkerSkillRepository.set_rating() call). Per-field audit, same
        shape as update(), so this shows up in the plan's history panel
        exactly like a manual status edit would."""
        existing = self.get_by_id(action_plan_id)
        if not existing:
            return

        new_values = {
            'status': 'effective',
            'completed_date': completed_date,
            'effectiveness_date': effectiveness_date,
            'skill_increase_applied': True,
        }
        self._execute(
            "UPDATE action_plans SET status = %s, completed_date = %s, effectiveness_date = %s, "
            "skill_increase_applied = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (*[new_values[f] for f in _TRAINING_COMPLETION_FIELDS], action_plan_id),
        )
        for field in _TRAINING_COMPLETION_FIELDS:
            old = existing[field]
            new = new_values[field]
            if old != new:
                self._audit('UPDATE', action_plan_id, label=existing['description'], field_name=field, old=old, new=new)

    def update(
        self, action_plan_id: int, *, description: str, responsible_id: Optional[str],
        planned_date: date, status: str, completed_date: Optional[date], effectiveness_date: Optional[date],
    ) -> bool:
        """LUK_2 — update every mutable field in one call (same shape as
        TrainingParticipantRepository.update: the tracking page's edit form
        doesn't distinguish "changed the description" from "marked
        effective", it's one form). Unlike that method, this audits each
        changed field individually — the explicit ask this table was built
        for is a full per-field history, not just "something changed on
        this date"."""
        existing = self.get_by_id(action_plan_id)
        if not existing:
            return False

        new_values = {
            'description': description,
            'responsible_id': responsible_id,
            'planned_date': planned_date,
            'status': status,
            'completed_date': completed_date,
            'effectiveness_date': effectiveness_date,
        }

        self._execute(
            "UPDATE action_plans SET description = %s, responsible_id = %s, planned_date = %s, "
            "status = %s, completed_date = %s, effectiveness_date = %s, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = %s",
            (*[new_values[f] for f in _MUTABLE_FIELDS], action_plan_id),
        )

        for field in _MUTABLE_FIELDS:
            old = existing[field]
            new = new_values[field]
            if old != new:
                self._audit('UPDATE', action_plan_id, label=description, field_name=field, old=old, new=new)

        return True
