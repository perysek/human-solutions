"""
Repository dla działów firmy (departments) — słownik domeny Staamp HR,
powiązany ze stanowiskami (jobs.department_id).

W przeciwieństwie do JobRepository/SkillRepository (klucz naturalny TEXT),
działy nie mają wcześniej istniejącego kodu — klucz to SERIAL, jak przy
`roles` (repositories/roles/role_repository.py), a `name` jest polem
unikalnym wprowadzanym ręcznie.

"Kierownik działu" nie jest kolumną — jest wyliczany przy odczycie z
pracowników zajmujących stanowisko `is_managerial=TRUE` przypisane do tego
działu (patrz `_SELECT`). Podobnie liczba pracowników/stanowisk to
podzapytania COUNT, nie zdenormalizowane kolumny.
"""
from typing import Any, List, Optional

from exceptions import ConflictError
from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

# `worker_count` liczy tylko aktywnych pracowników (fire_date IS NULL) —
# decyzja użytkownika: "ilość pracowników" w tabeli "Działy firmy" ma
# odzwierciedlać bieżący stan zatrudnienia, nie każdego kto kiedykolwiek
# zajmował stanowisko w tym dziale. `manager_names` z tego samego powodu
# filtruje do aktywnych — była osoba na stanowisku kierowniczym nie jest już
# kierownikiem działu.
_SELECT = """
    SELECT d.id, d.name, d.description, d.created_at, d.updated_at,
           (SELECT COUNT(*) FROM jobs j WHERE j.department_id = d.id) AS job_count,
           (SELECT COUNT(*) FROM workers w
              JOIN jobs j ON j.id = w.job_id
              WHERE j.department_id = d.id AND w.fire_date IS NULL) AS worker_count,
           (SELECT STRING_AGG(w.firstname || ' ' || w.surname, ', ' ORDER BY w.surname, w.firstname)
              FROM workers w
              JOIN jobs j ON j.id = w.job_id
              WHERE j.department_id = d.id AND j.is_managerial = TRUE AND w.fire_date IS NULL) AS manager_names
    FROM departments d
"""


class DepartmentRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'department'

    def __init__(self):
        super().__init__('departments')

    def get_all(self, search: Optional[str] = None) -> List[Any]:
        query = _SELECT
        params: tuple = ()
        if search:
            query += " WHERE d.name ILIKE %s OR d.description ILIKE %s"
            like = f"%{search}%"
            params = (like, like)
        query += " ORDER BY d.name"
        return self._fetch_all(query, params)

    def get_by_id(self, department_id: int) -> Optional[Any]:
        return self._fetch_one(_SELECT + " WHERE d.id = %s", (department_id,))

    def get_by_name(self, name: str) -> Optional[Any]:
        return self._fetch_one("SELECT id, name, description FROM departments WHERE name = %s", (name,))

    def list_options(self) -> List[Any]:
        """Bare id/name pairs for dropdowns (JobForm's dział select) —
        skips the three correlated-subquery aggregates in `_SELECT`, which
        the dropdown never needs."""
        return self._fetch_all("SELECT id, name FROM departments ORDER BY name")

    def get_managerial_job(self, department_id: int) -> Optional[Any]:
        """'At most one kierownicze (managerial) job-position per dział'
        guard — the department's current managerial job-position, if any.
        Backed by the partial unique index idx_jobs_one_manager_per_department
        (migration d1e2f3a4b5c6), which is the actual hard guarantee; this
        method is what lets routes/jobs/routes.py and
        routes/departments/routes.py give a friendly Polish ConflictError
        instead of only surfacing a raw IntegrityError on a race."""
        return self._fetch_one(
            "SELECT id, description FROM jobs WHERE department_id = %s AND is_managerial = TRUE",
            (department_id,),
        )

    def create(self, name: str, description: Optional[str]) -> int:
        new_id = self._execute_insert(
            "INSERT INTO departments (name, description) VALUES (%s, %s)",
            (name, description),
        )
        self._audit('CREATE', new_id, label=name)
        return new_id

    def update(self, department_id: int, name: str, description: Optional[str]) -> None:
        existing = self.get_by_id(department_id)
        old_name = existing['name'] if existing else None
        query = "UPDATE departments SET name = %s, description = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        self._execute(query, (name, description, department_id))
        self._audit(
            'UPDATE', department_id, label=name,
            field_name='name', old=old_name, new=name,
        )

    def count_blocking_references(self, department_id: int) -> dict:
        """Zlicza stanowiska (jobs.department_id, ON DELETE RESTRICT), które
        zablokują twarde usunięcie tego działu."""
        row = self._fetch_one("SELECT COUNT(*) AS total FROM jobs WHERE department_id = %s", (department_id,))
        count = row['total'] if row else 0
        return {'jobs': count} if count else {}

    def delete(self, department_id: int) -> bool:
        blocking = self.count_blocking_references(department_id)
        blocked_by = {k: v for k, v in blocking.items() if v}
        if blocked_by:
            details = ', '.join(f'{v} {k}' for k, v in blocked_by.items())
            raise ConflictError(
                f'Nie można usunąć działu — jest w użyciu ({details}).'
            )

        existing = self.get_by_id(department_id)
        cursor = self._execute("DELETE FROM departments WHERE id = %s", (department_id,))
        deleted = cursor.rowcount > 0
        if deleted and existing:
            self._audit('DELETE', department_id, label=existing['name'])
        return deleted
