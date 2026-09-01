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

# Joins the worker's job description, (task1) its department/is_managerial
# flag, and (product decision, 2026-08-24) a derived "boss" label, in one
# query — this is the shared SELECT base for both get_all (list, WRK_1/
# WRK_11) and get_by_id (profile header, WRK_2). department_name/
# is_managerial feed WorkerViewPage's "kierownik działu xxxxx" label — a
# worker is shown as managing a department when their own job.is_managerial
# is true AND that job has a department_id (see routes/workers/routes.py's
# _worker_json).
#
# boss_name — no longer a stored self-reference (workers.boss_id was
# dropped, migration e2f3a4b5c6d7): "przełożony" is derived exactly like
# DepartmentRepository._SELECT's manager_names and JobRepository's
# supervisor_job_id — whoever holds the is_managerial=TRUE job in this
# worker's own job's department (idx_jobs_one_manager_per_department caps
# that at one job, but nothing caps how many active workers hold it, so this
# is a STRING_AGG same as manager_names, not a single name). NULL when the
# worker's job has no department, or that department has no managerial job,
# or nobody currently holds it.
#
# Split into columns/FROM (rather than one opaque string) so get_all can
# splice in `_NEEDS_ATTENTION_SQL` as one more selected column without
# duplicating the join list — see get_all's own query below.
_BASE_COLUMNS = """
    w.id, w.firstname, w.surname, w.job_id, j.description AS job_description,
    j.is_managerial AS job_is_managerial, j.department_id, d.name AS department_name,
    (SELECT STRING_AGG(bw.firstname || ' ' || bw.surname, ', ' ORDER BY bw.surname, bw.firstname)
       FROM workers bw WHERE bw.job_id = sj.id AND bw.fire_date IS NULL) AS boss_name,
    w.gender, w.hire_date, w.fire_date, w.created_at, w.updated_at,
    wos.completed AS onboarding_completed, wos.completion_pct AS onboarding_completion_pct
"""
_FROM_CLAUSE = """
    FROM workers w
    LEFT JOIN jobs j ON j.id = w.job_id
    LEFT JOIN departments d ON d.id = j.department_id
    LEFT JOIN jobs sj ON sj.department_id = j.department_id
        AND sj.is_managerial = TRUE AND sj.id != j.id
    LEFT JOIN worker_onboarding_status wos ON wos.worker_id = w.id AND wos.job_id = w.job_id
"""
_SELECT_BASE = f"SELECT {_BASE_COLUMNS} {_FROM_CLAUSE}"

# task3 — WorkersListPage's "needs attention" badge/filter/stat-cards.
# Three independent per-category boolean expressions (no alias — spliced
# into a SELECT column list with "AS ..." by callers, or into a WHERE/
# FILTER clause directly) so get_all's row flag and
# count_needs_attention_by_category's per-category totals can never drift
# apart by sharing one definition each:
#  - competence gap: the worker's job has >=1 required skill they don't
#    currently meet (required_rating - current_rating >= 1, unassessed
#    counts as 0) — same definition as WorkerSkillRepository.filter_by_gap
#    and competency_service.get_gap_analysis.
#  - bhp/medical "expired": the worker HAS at least one record of that
#    kind, but NONE of them is currently valid (valid_until IS NULL is
#    "never expires", same as alert_service's get_expiring NULL handling).
#    A worker with zero records of a kind is not flagged — nothing has
#    expired if nothing was ever recorded.
_GAP_EXISTS_SQL = """
    EXISTS (
        SELECT 1 FROM job_skills js
        LEFT JOIN worker_skills ws ON ws.worker_id = w.id AND ws.skill_id = js.skill_id
        WHERE js.job_id = w.job_id AND (js.required_rating - COALESCE(ws.current_rating, 0)) >= 1
    )
"""
_BHP_EXPIRED_SQL = """
    (
        EXISTS (SELECT 1 FROM bhp_trainings bt WHERE bt.worker_id = w.id)
        AND NOT EXISTS (
            SELECT 1 FROM bhp_trainings bt
            WHERE bt.worker_id = w.id AND (bt.valid_until IS NULL OR bt.valid_until >= CURRENT_DATE)
        )
    )
"""
_MEDICAL_EXPIRED_SQL = """
    (
        EXISTS (SELECT 1 FROM medical_exams me WHERE me.worker_id = w.id)
        AND NOT EXISTS (
            SELECT 1 FROM medical_exams me
            WHERE me.worker_id = w.id AND (me.valid_until IS NULL OR me.valid_until >= CURRENT_DATE)
        )
    )
"""
_NEEDS_ATTENTION_EXPR = f"({_GAP_EXISTS_SQL} OR {_BHP_EXPIRED_SQL} OR {_MEDICAL_EXPIRED_SQL})"
_NEEDS_ATTENTION_SQL = f"{_NEEDS_ATTENTION_EXPR} AS needs_attention"


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
        gender: str = 'UNKNOWN', hire_date: Optional[date] = None,
    ) -> str:
        """Insert a worker row. Caller (services/worker_service.py) is
        expected to run this inside managed_transaction() alongside the
        birth/nationality/foreigner rows (ERR_1)."""
        worker_id = self._next_id()
        query = """
            INSERT INTO workers (id, firstname, surname, job_id, gender, hire_date)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        self._execute(query, (worker_id, firstname, surname, job_id, gender, hire_date))
        self._audit('CREATE', worker_id, label=f'{firstname} {surname}')
        return worker_id

    def get_by_id(self, worker_id: str) -> Optional[Any]:
        query = _SELECT_BASE + " WHERE w.id = %s"
        return self._fetch_one(query, (worker_id,))

    def get_all(
        self, *, status: Optional[str] = None, search: Optional[str] = None,
        needs_attention: Optional[str] = None,
        sort: Optional[str] = None, order: str = 'asc',
        page: int = 1, page_size: int = 25,
    ) -> Tuple[List[Any], int]:
        """Paginated, filtered, sorted worker list (WRK_1/WRK_11). Returns
        (rows_for_this_page, total_matching_count) — the frontend's
        PaginatedTable needs the total to render page controls even though
        it only receives one page's worth of rows.

        `needs_attention`: 'yes' | 'no' | None/'all' — task3's "Wymaga
        uwagi" filter dropdown, reusing `_NEEDS_ATTENTION_EXPR` so the
        filter always agrees with the badge each row gets."""
        conditions = []
        params: list = []

        if status == 'active':
            conditions.append('w.fire_date IS NULL')
        elif status == 'inactive':
            conditions.append('w.fire_date IS NOT NULL')
        # status in (None, 'all') -> no filter

        if search:
            like = f'%{search}%'
            conditions.append(
                '(w.firstname ILIKE %s OR w.surname ILIKE %s OR j.description ILIKE %s OR w.job_id ILIKE %s)'
            )
            params.extend([like, like, like, like])

        if needs_attention == 'yes':
            conditions.append(_NEEDS_ATTENTION_EXPR)
        elif needs_attention == 'no':
            conditions.append(f'NOT {_NEEDS_ATTENTION_EXPR}')
        # needs_attention in (None, 'all') -> no filter

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ''

        sort_column = _SORT_COLUMNS.get(sort or _DEFAULT_SORT, _SORT_COLUMNS[_DEFAULT_SORT])
        order_sql = 'DESC' if str(order).lower() == 'desc' else 'ASC'

        count_query = f"SELECT COUNT(*) AS total FROM workers w LEFT JOIN jobs j ON j.id = w.job_id{where_clause}"
        total = self._fetch_one(count_query, tuple(params))['total']

        offset = max(page - 1, 0) * page_size
        list_query = (
            f"SELECT {_BASE_COLUMNS}, {_NEEDS_ATTENTION_SQL} {_FROM_CLAUSE}"
            + where_clause
            + f" ORDER BY {sort_column} {order_sql}, w.id ASC LIMIT %s OFFSET %s"
        )
        rows = self._fetch_all(list_query, tuple(params) + (page_size, offset))

        return rows, total

    def update(
        self, worker_id: str, *, firstname: str, surname: str,
        job_id: Optional[str], gender: str, hire_date: Optional[date],
    ) -> None:
        query = """
            UPDATE workers
            SET firstname = %s, surname = %s, job_id = %s,
                gender = %s, hire_date = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """
        self._execute(query, (firstname, surname, job_id, gender, hire_date, worker_id))
        self._audit('UPDATE', worker_id, label=f'{firstname} {surname}')

    def set_fire_date(self, worker_id: str, fire_date: date) -> bool:
        """Soft-delete (WRK_8/RODO_4) — sets fire_date, never a physical
        DELETE. Only called from services.worker_service.finalize_due_terminations
        once a submitted notice's planned_fire_date is reached — HR no
        longer sets this directly (see the "Złożenie wypowiedzenia" flow,
        WorkerTerminationRepository)."""
        query = "UPDATE workers SET fire_date = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s AND fire_date IS NULL"
        cursor = self._execute(query, (fire_date, worker_id))
        deactivated = cursor.rowcount > 0
        if deactivated:
            self._audit('DEACTIVATE', worker_id, field_name='fire_date', new=fire_date.isoformat())
        return deactivated

    def get_subordinates(self, worker_id: str) -> List[Any]:
        """Direct reports of `worker_id` (WRK_9) — one level, not the full
        transitive tree (the plan's own wording: "lista pracowników
        przypisanych do danego przełożonego"), derived from the job
        hierarchy: every non-managerial worker in the department `worker_id`
        manages (empty if `worker_id`'s own job isn't flagged
        is_managerial — a non-manager has no subordinates)."""
        query = _SELECT_BASE + """
            WHERE COALESCE(j.is_managerial, FALSE) = FALSE
            AND j.department_id IN (
                SELECT mj.department_id FROM workers mw
                JOIN jobs mj ON mj.id = mw.job_id
                WHERE mw.id = %s AND mj.is_managerial = TRUE AND mj.department_id IS NOT NULL
            )
            ORDER BY w.surname, w.firstname
        """
        return self._fetch_all(query, (worker_id,))

    def count_needs_attention_by_category(self) -> dict:
        """task2 — WorkersListPage's stat cards. Active-worker (fire_date
        IS NULL, same "aktywny" scope as count_active) counts per 'needs
        attention' category, using the exact same three expressions
        get_all's row-level flag and the 'yes'/'no' filter use, so the
        cards' numbers always agree with which rows the badge/filter show."""
        query = f"""
            SELECT
                COUNT(*) FILTER (WHERE {_GAP_EXISTS_SQL}) AS gap_count,
                COUNT(*) FILTER (WHERE {_MEDICAL_EXPIRED_SQL}) AS medical_count,
                COUNT(*) FILTER (WHERE {_BHP_EXPIRED_SQL}) AS bhp_count
            FROM workers w
            WHERE w.fire_date IS NULL
        """
        row = self._fetch_one(query)
        return {
            'gap_count': row['gap_count'],
            'medical_count': row['medical_count'],
            'bhp_count': row['bhp_count'],
        }

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

    def list_active_for_org_chart(self) -> List[Any]:
        """Bare id/name/job_id for active workers only (fire_date IS NULL) —
        org_chart_service.get_org_chart_tree groups these under their
        job/department; none of _SELECT_BASE's heavier joins (onboarding
        status, boss_name, department_name, …) are needed here, the same
        "skip the aggregates the caller doesn't need" reasoning as
        DepartmentRepository.list_options vs. its full _SELECT."""
        return self._fetch_all(
            "SELECT id, firstname, surname, job_id FROM workers WHERE fire_date IS NULL ORDER BY surname, firstname",
        )
