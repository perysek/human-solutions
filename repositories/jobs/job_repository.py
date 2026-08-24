"""
Repository dla stanowisk (jobs) — słownik domeny Staamp HR (IMPLEMENTATION_PLAN.md §6).

Pierwsze repozytorium w tej bazie kodu łączące AuditableMixin z BaseRepository
(cross-cutting decision #3) — poprzednie repozytoria audytowane
(EmployeeRepository, teraz usunięte) korzystały z surowego get_db_connection()
sprzed wprowadzenia BaseRepository.
"""
from typing import Any, List, Optional

from exceptions import ConflictError
from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class JobRepository(AuditableMixin, BaseRepository):
    """Repository dla stanowisk. Klucz naturalny TEXT (id = kod stanowiska,
    np. "BRYGADZISTA") — patrz cross-cutting decision #1, dziedziczony z
    legacy SQLite. `id` pełni jednocześnie rolę nazwy wyświetlanej."""

    audit_entity_type = 'job'
    # department_name via LEFT JOIN — jobs.department_id jest opcjonalne
    # (task1: "Optional"), więc INNER JOIN wykluczałby stanowiska bez działu.
    #
    # supervisor_job_* — "stanowisko przełożone" nie jest osobną kolumną,
    # wyliczane jest z dwóch poziomów hierarchii (dwa niezależne "co najwyżej
    # jeden X" guardy — idx_jobs_one_manager_per_department i
    # idx_jobs_one_director):
    #   - zwykłe stanowisko -> przełożonym jest stanowisko kierownicze (sj)
    #     tego samego działu (jeśli istnieje, i nie jest samym sobą);
    #   - stanowisko kierownicze -> przełożonym jest stanowisko Dyrektora
    #     zakładu (dj), jeśli takie istnieje w firmie (`is_director=TRUE`),
    #     NIE przełożony lokalny — dyrektor jest zwierzchnikiem najwyższego
    #     szczebla nad wszystkimi kierownikami działów;
    #   - stanowisko Dyrektora zakładu -> brak przełożonego (szczyt
    #     hierarchii).
    #
    # worker_count — liczba aktywnych pracowników (fire_date IS NULL) na tym
    # stanowisku, ta sama definicja "aktywny" co DepartmentRepository's
    # worker_count/manager_names.
    _columns = (
        'j.id, j.description, j.department_id, d.name AS department_name, '
        'j.is_managerial, j.is_director, j.created_at, j.updated_at, '
        'CASE WHEN j.is_director THEN NULL '
        'WHEN j.is_managerial THEN dj.id ELSE sj.id END AS supervisor_job_id, '
        'CASE WHEN j.is_director THEN NULL '
        'WHEN j.is_managerial THEN dj.description ELSE sj.description END AS supervisor_job_description, '
        '(SELECT COUNT(*) FROM workers w WHERE w.job_id = j.id AND w.fire_date IS NULL) AS worker_count'
    )
    _FROM = (
        'FROM jobs j LEFT JOIN departments d ON d.id = j.department_id '
        'LEFT JOIN jobs sj ON sj.department_id = j.department_id '
        'AND sj.is_managerial = TRUE AND sj.id != j.id '
        'LEFT JOIN jobs dj ON dj.is_director = TRUE AND dj.id != j.id'
    )

    def __init__(self):
        super().__init__('jobs')

    def get_all(self, search: Optional[str] = None) -> List[Any]:
        """Lista stanowisk, opcjonalnie filtrowana po id/opisie (JOB_1)."""
        query = f"SELECT {self._columns} {self._FROM}"
        params: tuple = ()
        if search:
            query += " WHERE j.id ILIKE %s OR j.description ILIKE %s"
            like = f"%{search}%"
            params = (like, like)
        query += " ORDER BY j.id"
        return self._fetch_all(query, params)

    def get_by_id(self, job_id: str) -> Optional[Any]:
        """Override BaseRepository.get_by_id — potrzebny LEFT JOIN dla
        department_name, którego generyczny `SELECT {_columns} FROM
        {table_name}` nie obsłuży (`_columns` odwołuje się do aliasu `d`)."""
        query = f"SELECT {self._columns} {self._FROM} WHERE j.id = %s"
        return self._fetch_one(query, (job_id,))

    def get_by_ids(self, job_ids: List[str]) -> List[Any]:
        """Bulk get, `is_managerial` included — used by
        routes/departments/routes.py's api_add_jobs to pre-check the
        'at most one manager per department' rule against a whole batch
        of incoming job_ids in one query."""
        if not job_ids:
            return []
        clause, params = self._in_clause(job_ids)
        return self._fetch_all(f"SELECT {self._columns} {self._FROM} WHERE j.id IN {clause}", params)

    def create(
        self, job_id: str, description: Optional[str], department_id: Optional[int] = None,
        is_managerial: bool = False, is_director: bool = False,
    ) -> str:
        """Utwórz stanowisko. Wywołujący (route) odpowiada za sprawdzenie
        unikalności id przed wywołaniem — patrz routes/jobs/routes.py."""
        query = (
            "INSERT INTO jobs (id, description, department_id, is_managerial, is_director) "
            "VALUES (%s, %s, %s, %s, %s)"
        )
        self._execute(query, (job_id, description, department_id, is_managerial, is_director))
        self._audit('CREATE', job_id, label=description or job_id)
        return job_id

    def update(
        self, job_id: str, description: Optional[str], department_id: Optional[int] = None,
        is_managerial: bool = False, is_director: bool = False,
    ) -> None:
        """Zaktualizuj stanowisko. Audytuje zmianę pola description,
        żeby historia zmian pokazywała starą i nową wartość, nie tylko fakt
        edycji — department_id/is_managerial/is_director nie są osobno
        audytowane (drugorzędne wobec description, jak gender w
        WorkerRepository) — poza samym przejęciem flagi is_director, patrz
        clear_director() poniżej."""
        existing = self.get_by_id(job_id)
        old_description = existing['description'] if existing else None
        query = (
            "UPDATE jobs SET description = %s, department_id = %s, is_managerial = %s, is_director = %s, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        )
        self._execute(query, (description, department_id, is_managerial, is_director, job_id))
        self._audit(
            'UPDATE', job_id, label=description or job_id,
            field_name='description', old=old_description, new=description,
        )

    def get_director_job(self) -> Optional[Any]:
        """'Co najwyżej jeden Dyrektor zakładu w firmie' — firmowy
        odpowiednik get_managerial_job (DepartmentRepository), ale bez
        zawężenia do działu. Twarda gwarancja to partial unique index
        idx_jobs_one_director (migracja f3a4b5c6d7e8); w przeciwieństwie do
        reguły "jeden kierownik na dział" to NIE jest blokujący pre-check —
        routes/jobs/routes.py woła clear_director() na dotychczasowym
        posiadaczu flagi zamiast odrzucać zapis ConflictError."""
        return self._fetch_one("SELECT id, description FROM jobs WHERE is_director = TRUE")

    def clear_director(self, job_id: str) -> None:
        """Zdejmuje flagę is_director z dotychczasowego Dyrektora zakładu —
        wywoływane, gdy inne stanowisko przejmuje tę rolę (może ją mieć
        tylko jedno stanowisko naraz, patrz get_director_job)."""
        self._execute(
            "UPDATE jobs SET is_director = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (job_id,),
        )
        self._audit('UPDATE', job_id, field_name='is_director', old='True', new='False')

    def get_orphan_jobs(self) -> List[Any]:
        """Task 2 (Pulpit alerts) — stanowiska bez przypisanego działu
        (jobs.department_id IS NULL, migracja c9d0e1f2a3b4). Bez agregatów
        _columns's LEFT JOIN department_name potrzebuje (zawsze NULL tutaj z
        definicji filtra), więc prosty SELECT wystarczy."""
        return self._fetch_all(
            "SELECT id, description FROM jobs WHERE department_id IS NULL ORDER BY id",
        )

    def assign_department(self, job_ids: List[str], department_id: int) -> int:
        """Działy firmy's '+' modal (task1) — bulk-assign existing job-
        positions to a department. Deliberately a targeted department_id-only
        UPDATE, NOT routed through update() above (which overwrites
        description/is_managerial too from whatever the caller passes) — this
        can only ever change department_id, never silently blank out a job's
        other fields. Purely additive/reassigning: jobs not in `job_ids` are
        untouched, same "add" semantics as the modal's name implies (not a
        replace-the-whole-set endpoint like TrainingJobRepository.replace_links)."""
        if not job_ids:
            return 0
        clause, params = self._in_clause(job_ids)
        cursor = self._execute(
            f"UPDATE jobs SET department_id = %s, updated_at = CURRENT_TIMESTAMP WHERE id IN {clause}",
            (department_id, *params),
        )
        for job_id in job_ids:
            self._audit('UPDATE', job_id, field_name='department_id', new=str(department_id))
        return cursor.rowcount

    def unassign_department(self, job_id: str) -> bool:
        """Działy firmy edit page's per-row remove icon — the mirror of
        assign_department above: clears department_id back to NULL for one
        job-position. Same targeted-column UPDATE (never routed through
        update(), which would also overwrite description/is_managerial) —
        this is an unlink, not a delete: the job-position itself, its
        required skills, and any worker holding it are all untouched."""
        cursor = self._execute(
            "UPDATE jobs SET department_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (job_id,),
        )
        updated = cursor.rowcount > 0
        if updated:
            self._audit('UPDATE', job_id, field_name='department_id', new=None)
        return updated

    def count_blocking_references(self, job_id: str) -> dict:
        """Zlicza wiersze chronione ON DELETE RESTRICT, które zablokują
        twarde usunięcie tego stanowiska.

        `workers.job_id` jest ON DELETE RESTRICT — stanowisko używane przez
        jakiegokolwiek pracownika nie może zostać usunięte. `job_skills`/
        `training_job` (Fazy 3/5) są ON DELETE CASCADE, więc nie blokują
        usunięcia — w tej metodzie liczą się tylko kolumny RESTRICT.
        """
        from repositories.workers.worker_repository import WorkerRepository
        count = WorkerRepository().count_by_job(job_id)
        return {'workers': count} if count else {}

    def delete(self, job_id: str) -> bool:
        """Usuń stanowisko (twardo — tabele słownikowe nie mają soft-delete).
        Blokuje usunięcie, jeśli istnieją odwołania chronione RESTRICT."""
        blocking = self.count_blocking_references(job_id)
        blocked_by = {k: v for k, v in blocking.items() if v}
        if blocked_by:
            details = ', '.join(f'{v} {k}' for k, v in blocked_by.items())
            raise ConflictError(
                f'Nie można usunąć stanowiska "{job_id}" — jest w użyciu ({details}).'
            )

        existing = self.get_by_id(job_id)
        query = "DELETE FROM jobs WHERE id = %s"
        cursor = self._execute(query, (job_id,))
        deleted = cursor.rowcount > 0
        if deleted and existing:
            self._audit('DELETE', job_id, label=existing['description'] or job_id)
        return deleted
