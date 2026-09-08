"""Repository for worker_absence_balance_adjustments — manual balance corrections."""
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_COLUMNS = (
    "id, worker_id, category_id, delta_value, reason, period_label, "
    "is_deleted, deleted_at, created_by, created_at, updated_at"
)


class WorkerAbsenceAdjustmentRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker_absence_adjustment'

    def __init__(self):
        super().__init__('worker_absence_balance_adjustments')

    def list_for_worker(self, worker_id: str, include_deleted: bool = False) -> List[Any]:
        deleted_clause = '' if include_deleted else 'AND aba.is_deleted = FALSE'
        query = f"""
            SELECT aba.id, aba.worker_id, aba.category_id, aba.delta_value, aba.reason,
                   aba.period_label, aba.is_deleted, aba.deleted_at, aba.created_by,
                   aba.created_at, aba.updated_at,
                   ac.name AS category_name, u.full_name AS created_by_name
            FROM worker_absence_balance_adjustments aba
            JOIN worker_absence_categories ac ON ac.id = aba.category_id
            LEFT JOIN users u ON u.id = aba.created_by
            WHERE aba.worker_id = %s {deleted_clause}
            ORDER BY aba.created_at DESC
        """
        return self._fetch_all(query, (worker_id,))

    def list_for_worker_category(self, worker_id: str, category_id: int) -> List[Any]:
        return self._fetch_all(
            f"SELECT {_COLUMNS} FROM worker_absence_balance_adjustments "
            "WHERE worker_id = %s AND category_id = %s AND is_deleted = FALSE ORDER BY created_at DESC",
            (worker_id, category_id),
        )

    def create(
        self, *, worker_id: str, category_id: int, delta_value: float, reason: str,
        period_label: Optional[str], created_by: Optional[int],
    ) -> int:
        query = """
            INSERT INTO worker_absence_balance_adjustments
                (worker_id, category_id, delta_value, reason, period_label, created_by)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        new_id = self._execute_insert(query, (worker_id, category_id, delta_value, reason, period_label, created_by))
        self._audit('CREATE', new_id, label=f'{worker_id} — {delta_value:+.1f}', new=str(delta_value))
        return new_id

    def soft_delete(self, adj_id: int) -> bool:
        cursor = self._execute(
            "UPDATE worker_absence_balance_adjustments SET is_deleted = TRUE, "
            "deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = %s AND is_deleted = FALSE",
            (adj_id,),
        )
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', adj_id, field_name='is_deleted', old='false', new='true')
        return deleted
