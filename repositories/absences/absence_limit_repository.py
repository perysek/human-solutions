"""Repository for worker_absence_limits — per-worker override of a category's
default_max_value.
"""
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_COLUMNS = (
    "id, worker_id, category_id, max_value, notes, "
    "is_deleted, deleted_at, created_by, created_at, updated_at"
)


class WorkerAbsenceLimitRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker_absence_limit'

    def __init__(self):
        super().__init__('worker_absence_limits')

    def get_for_worker_category(self, worker_id: str, category_id: int) -> Optional[Any]:
        return self._fetch_one(
            f"SELECT {_COLUMNS} FROM worker_absence_limits "
            "WHERE worker_id = %s AND category_id = %s AND is_deleted = FALSE",
            (worker_id, category_id),
        )

    def list_for_worker(self, worker_id: str) -> List[Any]:
        return self._fetch_all(
            f"SELECT {_COLUMNS} FROM worker_absence_limits "
            "WHERE worker_id = %s AND is_deleted = FALSE ORDER BY category_id",
            (worker_id,),
        )

    def upsert(
        self, *, worker_id: str, category_id: int, max_value: float,
        notes: Optional[str], created_by: Optional[int],
    ) -> int:
        query = """
            INSERT INTO worker_absence_limits (worker_id, category_id, max_value, notes, created_by)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (worker_id, category_id) WHERE is_deleted = FALSE
            DO UPDATE SET max_value = EXCLUDED.max_value, notes = EXCLUDED.notes,
                          updated_at = CURRENT_TIMESTAMP
        """
        new_id = self._execute_insert(query, (worker_id, category_id, max_value, notes, created_by))
        self._audit('UPDATE', new_id, label=f'{worker_id} — cat {category_id}', new=str(max_value))
        return new_id

    def soft_delete(self, limit_id: int) -> bool:
        cursor = self._execute(
            "UPDATE worker_absence_limits SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = %s AND is_deleted = FALSE",
            (limit_id,),
        )
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', limit_id, field_name='is_deleted', old='false', new='true')
        return deleted
