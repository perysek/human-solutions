"""
Repository dla pracowników (workers) — rdzeń domeny Staamp HR (IMPLEMENTATION_PLAN.md §7).

Klucz naturalny TEXT, jak `jobs`/`skills` (cross-cutting decision #1) —
legacy id (np. "9001") przenoszone wprost przy migracji z Fazy 8. Nowi
pracownicy (dodani już w tym systemie) dostają kolejny numer: MAX(id)+1
wśród obecnych numerycznych id — decyzja podjęta interaktywnie z
użytkownikiem (nie generujemy z wysokiej bazy ani nie prosimy HR o ręczne
wpisanie kodu, w przeciwieństwie do jobs/skills, gdzie kod ma znaczenie).
"""
from datetime import date
from typing import Any, List, Optional, Tuple

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

# Whitelisted sort columns — never interpolate a raw client-supplied column
# name into SQL. Maps the API's `sort` query param to a real, qualified column.
_SORT_COLUMNS = {
    'surname': 'w.surname',
    'firstname': 'w.firstname',
    'job_id': 'w.job_id',
    'hire_date': 'w.hire_date',
    'fire_date': 'w.fire_date',
}
_DEFAULT_SORT = 'surname'

# Joins firstname/surname of both the worker and their boss, plus the job's
# description, in one query — this is the shared SELECT base for both
# get_all (list, WRK_1/WRK_11) and get_by_id (profile header, WRK_2).
_SELECT_BASE = """
    SELECT w.id, w.firstname, w.surname, w.job_id, j.description AS job_description,
           w.boss_id, b.firstname AS boss_firstname, b.surname AS boss_surname,
           w.gender, w.hire_date, w.fire_date, w.created_at, w.updated_at
    FROM workers w
    LEFT JOIN jobs j ON j.id = w.job_id
    LEFT JOIN workers b ON b.id = w.boss_id
"""


class WorkerRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('workers')

    def _next_id(self) -> str:
        """MAX(id)+1 among numeric-looking existing ids (id ~ '^[0-9]+$'),
        so a non-numeric legacy id (should one ever exist) can't break the
        cast. Starts at 1 when the table is empty or holds only non-numeric
        ids — see IMPLEMENTATION_PLAN.md discussion: chosen over a
        high-base scheme for simplicity, accepting the (low, flagged) risk
        of a future Phase 8 import needing a higher id than anything
        generated in the meantime."""
        row = self._fetch_one(
            "SELECT COALESCE(MAX(id::integer), 0) + 1 AS next_id FROM workers WHERE id ~ '^[0-9]+$'"
        )
        return str(row['next_id'])

    def create(
        self, *, firstname: str, surname: str, job_id: Optional[str] = None,
        boss_id: Optional[str] = None, gender: str = 'UNKNOWN',
        hire_date: Optional[date] = None,
    ) -> str:
        """Insert a worker row. Caller (services/worker_service.py) is
        expected to run this inside managed_transaction() alongside the
        birth/nationality/foreigner rows (ERR_1)."""
        worker_id = self._next_id()
        query = """
            INSERT INTO workers (id, firstname, surname, job_id, boss_id, gender, hire_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        self._execute(query, (worker_id, firstname, surname, job_id, boss_id, gender, hire_date))
        self._audit('CREATE', worker_id, label=f'{firstname} {surname}')
        return worker_id

    def get_by_id(self, worker_id: str) -> Optional[Any]:
        query = _SELECT_BASE + " WHERE w.id = %s"
        return self._fetch_one(query, (worker_id,))

    def get_all(
        self, *, status: Optional[str] = None, search: Optional[str] = None,
        sort: Optional[str] = None, order: str = 'asc',
        page: int = 1, page_size: int = 25,
    ) -> Tuple[List[Any], int]:
        """Paginated, filtered, sorted worker list (WRK_1/WRK_11). Returns
        (rows_for_this_page, total_matching_count) — the frontend's
        PaginatedTable needs the total to render page controls even though
        it only receives one page's worth of rows."""
        conditions = []
        params: list = []

        if status == 'active':
            conditions.append('w.fire_date IS NULL')
        elif status == 'inactive':
            conditions.append('w.fire_date IS NOT NULL')
        # status in (None, 'all') -> no filter

        if search:
            like = f'%{search}%'
            conditions.append('(w.firstname ILIKE %s OR w.surname ILIKE %s OR j.description ILIKE %s OR w.job_id ILIKE %s)')
            params.extend([like, like, like, like])

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ''

        sort_column = _SORT_COLUMNS.get(sort or _DEFAULT_SORT, _SORT_COLUMNS[_DEFAULT_SORT])
        order_sql = 'DESC' if str(order).lower() == 'desc' else 'ASC'

        count_query = f"SELECT COUNT(*) AS total FROM workers w LEFT JOIN jobs j ON j.id = w.job_id{where_clause}"
        total = self._fetch_one(count_query, tuple(params))['total']

        offset = max(page - 1, 0) * page_size
        list_query = _SELECT_BASE + where_clause + f" ORDER BY {sort_column} {order_sql}, w.id ASC LIMIT %s OFFSET %s"
        rows = self._fetch_all(list_query, tuple(params) + (page_size, offset))

        return rows, total

    def update(
        self, worker_id: str, *, firstname: str, surname: str,
        job_id: Optional[str], boss_id: Optional[str], gender: str,
        hire_date: Optional[date],
    ) -> None:
        query = """
            UPDATE workers
            SET firstname = %s, surname = %s, job_id = %s, boss_id = %s,
                gender = %s, hire_date = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """
        self._execute(query, (firstname, surname, job_id, boss_id, gender, hire_date, worker_id))
        self._audit('UPDATE', worker_id, label=f'{firstname} {surname}')

    def deactivate(self, worker_id: str) -> bool:
        """Soft-delete (WRK_8/RODO_4) — sets fire_date, never a physical DELETE."""
        query = "UPDATE workers SET fire_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND fire_date IS NULL"
        cursor = self._execute(query, (worker_id,))
        deactivated = cursor.rowcount > 0
        if deactivated:
            self._audit('DEACTIVATE', worker_id, field_name='fire_date', new='CURRENT_DATE')
        return deactivated

    def get_subordinates(self, boss_id: str) -> List[Any]:
        """Direct reports of `boss_id` (WRK_9) — one level, not the full
        transitive tree (the plan's own wording: "lista pracowników
        przypisanych do danego przełożonego")."""
        query = _SELECT_BASE + " WHERE w.boss_id = %s ORDER BY w.surname, w.firstname"
        return self._fetch_all(query, (boss_id,))

    def count_active(self) -> int:
        """DSH_1 — liczba aktywnych pracowników (fire_date IS NULL) dla
        podsumowania na pulpicie. Ta sama definicja „aktywny" co WRK_11's
        `status=active` filtr w get_all."""
        row = self._fetch_one("SELECT COUNT(*) AS total FROM workers WHERE fire_date IS NULL")
        return row['total']

    def count_by_job(self, job_id: str) -> int:
        """Used by JobRepository.count_blocking_references — a job in use
        by any worker (RESTRICT FK) can't be hard-deleted."""
        row = self._fetch_one("SELECT COUNT(*) AS total FROM workers WHERE job_id = %s", (job_id,))
        return row['total']

    def get_by_job(self, job_id: str) -> List[Any]:
        """Active+inactive workers holding this job (JOB_5)."""
        query = _SELECT_BASE + " WHERE w.job_id = %s ORDER BY w.surname, w.firstname"
        return self._fetch_all(query, (job_id,))
