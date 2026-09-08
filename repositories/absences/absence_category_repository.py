"""Repository for worker_absence_categories — the lookup/config table behind
every absence type (vacation, L4, home office, ...). Each row's is_tracked /
count_period / resets_at / rolling_days / warning_threshold_pct /
default_max_value columns are the toggle set the settings UI exposes as
switches — "customizable absence types with balance limits" is this table,
there is no separate schema for it.
"""
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_COLUMNS = (
    "id, name, description, absence_full_day, is_deleted, deleted_at, "
    "is_tracked, count_period, resets_at, rolling_days, warning_threshold_pct, "
    "default_max_value, created_at, updated_at"
)


class WorkerAbsenceCategoryRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker_absence_category'
    _columns = _COLUMNS
    _soft_delete = True

    def __init__(self):
        super().__init__('worker_absence_categories')

    def list_active(self) -> List[Any]:
        return self._fetch_all(
            f"SELECT {_COLUMNS} FROM worker_absence_categories "
            "WHERE is_deleted = FALSE ORDER BY name"
        )

    def list_with_deleted(self) -> List[Any]:
        return self._fetch_all(
            f"SELECT {_COLUMNS} FROM worker_absence_categories ORDER BY is_deleted, name"
        )

    def list_tracked(self) -> List[Any]:
        return self._fetch_all(
            f"SELECT {_COLUMNS} FROM worker_absence_categories "
            "WHERE is_deleted = FALSE AND is_tracked = TRUE ORDER BY name"
        )

    def create(
        self, *, name: str, description: Optional[str], absence_full_day: bool,
        is_tracked: bool = False, count_period: str = 'yearly',
        resets_at: Optional[int] = 1, rolling_days: Optional[int] = None,
        warning_threshold_pct: float = 0.80, default_max_value: float = 0.0,
    ) -> int:
        query = """
            INSERT INTO worker_absence_categories
                (name, description, absence_full_day, is_tracked, count_period,
                 resets_at, rolling_days, warning_threshold_pct, default_max_value)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        new_id = self._execute_insert(query, (
            name, description, absence_full_day, is_tracked, count_period,
            resets_at, rolling_days, warning_threshold_pct, default_max_value,
        ))
        self._audit('CREATE', new_id, label=name)
        return new_id

    def update(
        self, category_id: int, *, name: str, description: Optional[str],
        absence_full_day: bool, is_tracked: bool, count_period: str,
        resets_at: Optional[int], rolling_days: Optional[int],
        warning_threshold_pct: float, default_max_value: float,
    ) -> bool:
        query = """
            UPDATE worker_absence_categories
            SET name = %s, description = %s, absence_full_day = %s, is_tracked = %s,
                count_period = %s, resets_at = %s, rolling_days = %s,
                warning_threshold_pct = %s, default_max_value = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND is_deleted = FALSE
        """
        cursor = self._execute(query, (
            name, description, absence_full_day, is_tracked, count_period,
            resets_at, rolling_days, warning_threshold_pct, default_max_value,
            category_id,
        ))
        updated = cursor.rowcount > 0
        if updated:
            self._audit('UPDATE', category_id, label=name)
        return updated

    def soft_delete(self, category_id: int) -> bool:
        cursor = self._execute(
            "UPDATE worker_absence_categories SET is_deleted = TRUE, "
            "deleted_at = CURRENT_TIMESTAMP WHERE id = %s AND is_deleted = FALSE",
            (category_id,),
        )
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', category_id, field_name='is_deleted', old='false', new='true')
        return deleted

    def hard_delete(self, category_id: int) -> bool:
        """Permanently purge — caller (service) must already have verified the
        category is soft-deleted and has zero absence references (FK RESTRICT
        would otherwise reject this)."""
        cursor = self._execute("DELETE FROM worker_absence_categories WHERE id = %s", (category_id,))
        return cursor.rowcount > 0

    def count_absence_references(self, category_id: int) -> int:
        row = self._fetch_one(
            "SELECT COUNT(*) AS n FROM worker_absences WHERE category_id = %s", (category_id,)
        )
        return row['n'] if row else 0
