"""Read-only repository computing absence balance figures — used counts from
worker_absences, adjustments from worker_absence_balance_adjustments.
"""
from datetime import date
from typing import List

from repositories.base_repository import BaseRepository


class WorkerAbsenceBalanceRepository(BaseRepository):
    def __init__(self):
        super().__init__('worker_absences')

    def compute_used(self, worker_id: str, category_id: int, period_start: date, full_day: bool) -> float:
        """Sum approved, non-deleted absences in this category since period_start
        — whole days (full_day=True) or hours (full_day=False)."""
        value_expr = (
            "SUM(wa.date_to - wa.date_from + 1)" if full_day
            else "SUM(EXTRACT(EPOCH FROM (wa.time_to - wa.time_from)) / 3600.0)"
        )
        query = f"""
            SELECT COALESCE({value_expr}, 0.0) AS total
            FROM worker_absences wa
            WHERE wa.worker_id = %s AND wa.category_id = %s AND wa.status = 'approved'
              AND wa.is_deleted = FALSE AND wa.date_from >= %s
        """
        row = self._fetch_one(query, (worker_id, category_id, period_start))
        return float(row['total'] or 0.0)

    def compute_adjustments(self, worker_id: str, category_id: int) -> float:
        """Sum of all non-deleted adjustments — no period filter, always cumulative."""
        row = self._fetch_one(
            "SELECT COALESCE(SUM(delta_value), 0.0) AS total "
            "FROM worker_absence_balance_adjustments WHERE worker_id = %s AND category_id = %s "
            "AND is_deleted = FALSE",
            (worker_id, category_id),
        )
        return float(row['total'] or 0.0)

    def bulk_summary_for_list(self) -> List[dict]:
        """One query: for every active worker, figures for their lowest-id tracked
        category — feeds the worker-list balance column."""
        query = """
            WITH tracked AS (
                SELECT ac.id AS category_id, ac.name AS category_name, ac.absence_full_day,
                       ac.warning_threshold_pct, ac.default_max_value
                FROM worker_absence_categories ac
                WHERE ac.is_tracked = TRUE AND ac.is_deleted = FALSE
                ORDER BY ac.id
            ),
            workers_active AS (
                SELECT w.id AS worker_id FROM workers w WHERE w.fire_date IS NULL
            ),
            primary_cat AS (
                SELECT wa.worker_id, t.category_id, t.category_name, t.absence_full_day,
                       t.warning_threshold_pct, t.default_max_value,
                       ROW_NUMBER() OVER (PARTITION BY wa.worker_id ORDER BY t.category_id) AS rn
                FROM workers_active wa
                CROSS JOIN tracked t
            ),
            primary_only AS (
                SELECT * FROM primary_cat WHERE rn = 1
            ),
            eff_limit AS (
                SELECT po.worker_id, po.category_id,
                       COALESCE(wal.max_value, po.default_max_value) AS eff_max,
                       po.category_name, po.absence_full_day, po.warning_threshold_pct
                FROM primary_only po
                LEFT JOIN worker_absence_limits wal
                       ON wal.worker_id = po.worker_id AND wal.category_id = po.category_id
                      AND wal.is_deleted = FALSE
            ),
            adj AS (
                SELECT worker_id, category_id, COALESCE(SUM(delta_value), 0.0) AS adj_total
                FROM worker_absence_balance_adjustments
                WHERE is_deleted = FALSE
                GROUP BY worker_id, category_id
            )
            SELECT el.worker_id, el.category_id, el.category_name,
                   el.absence_full_day AS full_day, el.eff_max AS lim,
                   el.warning_threshold_pct, COALESCE(adj.adj_total, 0.0) AS adj_total
            FROM eff_limit el
            LEFT JOIN adj ON adj.worker_id = el.worker_id AND adj.category_id = el.category_id
            ORDER BY el.worker_id
        """
        return [dict(r) for r in self._fetch_all(query)]
