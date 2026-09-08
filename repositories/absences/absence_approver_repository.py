"""Repository for worker_absence_approvers — explicit worker -> approver
mapping HR maintains for the absence-request workflow. Deliberately separate
from the org chart's derived "boss" label (workers.boss_id was dropped;
that label can be multi-valued or empty — see ADR note in the migration
docstring), so absence approval always resolves to specific person(s).
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT_FOR_WORKER = """
    SELECT a.worker_id, a.approver_worker_id, w.firstname, w.surname, a.created_at
    FROM worker_absence_approvers a
    JOIN workers w ON w.id = a.approver_worker_id
    WHERE a.worker_id = %s
    ORDER BY w.surname, w.firstname
"""


class WorkerAbsenceApproverRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker_absence_approver'

    def __init__(self):
        super().__init__('worker_absence_approvers')

    def list_approvers_for(self, worker_id: str) -> List[Any]:
        return self._fetch_all(_SELECT_FOR_WORKER, (worker_id,))

    def list_subordinates_for(self, approver_worker_id: str) -> List[Any]:
        """Workers this person is registered as an approver for — drives the
        management view's default 'my team' scope."""
        return self._fetch_all(
            """
            SELECT a.worker_id, w.firstname, w.surname
            FROM worker_absence_approvers a
            JOIN workers w ON w.id = a.worker_id
            WHERE a.approver_worker_id = %s
            ORDER BY w.surname, w.firstname
            """,
            (approver_worker_id,),
        )

    def is_approver_for(self, worker_id: str, approver_worker_id: str) -> bool:
        row = self._fetch_one(
            "SELECT 1 FROM worker_absence_approvers WHERE worker_id = %s AND approver_worker_id = %s",
            (worker_id, approver_worker_id),
        )
        return row is not None

    def is_approver_for_anyone(self, approver_worker_id: str) -> bool:
        """True if this worker is assigned as approver for at least one other
        worker — grants access to the management view/approve-reject actions
        regardless of role (see routes/absences/routes.py's
        absence_management_required)."""
        row = self._fetch_one(
            "SELECT 1 FROM worker_absence_approvers WHERE approver_worker_id = %s LIMIT 1",
            (approver_worker_id,),
        )
        return row is not None

    def add(self, worker_id: str, approver_worker_id: str) -> None:
        self._execute(
            "INSERT INTO worker_absence_approvers (worker_id, approver_worker_id) "
            "VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (worker_id, approver_worker_id),
        )
        self._audit('CREATE', None, label=f'{worker_id} -> {approver_worker_id}')

    def remove(self, worker_id: str, approver_worker_id: str) -> bool:
        cursor = self._execute(
            "DELETE FROM worker_absence_approvers WHERE worker_id = %s AND approver_worker_id = %s",
            (worker_id, approver_worker_id),
        )
        removed = cursor.rowcount > 0
        if removed:
            self._audit('DELETE', None, label=f'{worker_id} -/-> {approver_worker_id}')
        return removed
