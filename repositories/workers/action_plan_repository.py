"""
Repository dla planów działań korygujących lukę kompetencyjną (action_plans,
LUK_1). Jeden wiersz na działanie podjęte wobec konkretnej luki (worker_id +
skill_id) — patrz migracja c3d4e5f6a7b8 po uzasadnienie kolumn/FK.

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
           ap.created_at, ap.updated_at
    FROM action_plans ap
    JOIN workers w ON w.id = ap.worker_id
    JOIN skills s ON s.id = ap.skill_id
    LEFT JOIN workers r ON r.id = ap.responsible_id
"""

# The 6 caller-mutable columns update() tracks for per-field audit history —
# kept as one tuple so the "did anything change" loop and the UPDATE's SET
# list can't silently drift apart.
_MUTABLE_FIELDS = ('description', 'responsible_id', 'planned_date', 'status', 'completed_date', 'effectiveness_date')


class ActionPlanRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'action_plan'

    def __init__(self):
        super().__init__('action_plans')

    def get_all(self, status: Optional[str] = None, worker_id: Optional[str] = None) -> List[Any]:
        """LUK_2 — every action plan, optionally filtered. Open plans
        (anything short of 'effective') sort first, then by planned_date —
        the tracking page's default view is "what still needs attention",
        not a chronological log."""
        conditions = []
        params: list = []
        if status:
            conditions.append('ap.status = %s')
            params.append(status)
        if worker_id:
            conditions.append('ap.worker_id = %s')
            params.append(worker_id)
        where = f" WHERE {' AND '.join(conditions)}" if conditions else ''
        query = _SELECT + where + " ORDER BY (ap.status = 'effective'), ap.planned_date, ap.id DESC"
        return self._fetch_all(query, tuple(params))

    def get_by_id(self, action_plan_id: int) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE ap.id = %s", (action_plan_id,))
        return rows[0] if rows else None

    def create(
        self, *, worker_id: str, skill_id: str, description: str,
        responsible_id: Optional[str], planned_date: date, status: str = 'defined',
    ) -> int:
        new_id = self._execute_insert(
            "INSERT INTO action_plans (worker_id, skill_id, description, responsible_id, planned_date, status) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (worker_id, skill_id, description, responsible_id, planned_date, status),
        )
        self._audit('CREATE', new_id, label=description)
        return new_id

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
