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
    _columns = 'id, description, created_at, updated_at'

    def __init__(self):
        super().__init__('jobs')

    def get_all(self, search: Optional[str] = None) -> List[Any]:
        """Lista stanowisk, opcjonalnie filtrowana po id/opisie (JOB_1)."""
        query = f"SELECT {self._columns} FROM jobs"
        params: tuple = ()
        if search:
            query += " WHERE id ILIKE %s OR description ILIKE %s"
            like = f"%{search}%"
            params = (like, like)
        query += " ORDER BY id"
        return self._fetch_all(query, params)

    def create(self, job_id: str, description: Optional[str]) -> str:
        """Utwórz stanowisko. Wywołujący (route) odpowiada za sprawdzenie
        unikalności id przed wywołaniem — patrz routes/jobs/routes.py."""
        query = "INSERT INTO jobs (id, description) VALUES (%s, %s)"
        self._execute(query, (job_id, description))
        self._audit('CREATE', job_id, label=description or job_id)
        return job_id

    def update(self, job_id: str, description: Optional[str]) -> None:
        """Zaktualizuj opis stanowiska. Audytuje zmianę pola description,
        żeby historia zmian pokazywała starą i nową wartość, nie tylko fakt
        edycji."""
        existing = self.get_by_id(job_id)
        old_description = existing['description'] if existing else None
        query = "UPDATE jobs SET description = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        self._execute(query, (description, job_id))
        self._audit(
            'UPDATE', job_id, label=description or job_id,
            field_name='description', old=old_description, new=description,
        )

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
