"""
Repository dla umiejętności (skills) — słownik domeny Staamp HR (IMPLEMENTATION_PLAN.md §6).
Lustrzane odbicie repositories/jobs/job_repository.py — patrz tamten plik po
pełne uzasadnienie wzorca (AuditableMixin + BaseRepository, klucz naturalny TEXT).
"""
from typing import Any, List, Optional

from exceptions import ConflictError
from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

# task2 — "Powiązanych stanowisk" / "Pracowników z luką kompetencji" columns
# on SkillsListPage. Two correlated-subquery aggregates, only pulled in by
# get_all (the list view); get_by_id stays on the plain `_columns` — the
# edit form has no use for either count. `gap_worker_count` mirrors
# WorkerSkillRepository.filter_by_gap's own definition of "gap" (active
# workers only, required_rating - COALESCE(current_rating, 0) >= 1) so the
# number on this page always agrees with LUK_1's gap report for the same skill.
_LIST_SELECT = """
    SELECT s.id, s.description, s.created_at, s.updated_at,
           (SELECT COUNT(*) FROM job_skills js WHERE js.skill_id = s.id) AS job_count,
           (SELECT COUNT(*) FROM workers w
              JOIN job_skills js ON js.job_id = w.job_id AND js.skill_id = s.id
              LEFT JOIN worker_skills ws ON ws.worker_id = w.id AND ws.skill_id = s.id
              WHERE w.fire_date IS NULL
                AND (js.required_rating - COALESCE(ws.current_rating, 0)) >= 1) AS gap_worker_count
    FROM skills s
"""


class SkillRepository(AuditableMixin, BaseRepository):
    """Repository dla umiejętności. Klucz naturalny TEXT (id = kod
    umiejętności, np. "0002", dziedziczony z legacy SQLite)."""

    audit_entity_type = 'skill'
    _columns = 'id, description, created_at, updated_at'

    def __init__(self):
        super().__init__('skills')

    def get_all(self, search: Optional[str] = None) -> List[Any]:
        """Lista umiejętności, opcjonalnie filtrowana po id/opisie (SKL_1)."""
        query = _LIST_SELECT
        params: tuple = ()
        if search:
            query += " WHERE s.id ILIKE %s OR s.description ILIKE %s"
            like = f"%{search}%"
            params = (like, like)
        query += " ORDER BY s.id"
        return self._fetch_all(query, params)

    def create(self, skill_id: str, description: str) -> str:
        """Utwórz umiejętność. Wywołujący (route) odpowiada za sprawdzenie
        unikalności id przed wywołaniem — patrz routes/skills/routes.py."""
        query = "INSERT INTO skills (id, description) VALUES (%s, %s)"
        self._execute(query, (skill_id, description))
        self._audit('CREATE', skill_id, label=description)
        return skill_id

    def update(self, skill_id: str, description: str) -> None:
        """Zaktualizuj opis umiejętności, audytując starą/nową wartość pola."""
        existing = self.get_by_id(skill_id)
        old_description = existing['description'] if existing else None
        query = "UPDATE skills SET description = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
        self._execute(query, (description, skill_id))
        self._audit(
            'UPDATE', skill_id, label=description,
            field_name='description', old=old_description, new=description,
        )

    def count_blocking_references(self, skill_id: str) -> dict:
        """Zlicza wiersze chronione ON DELETE RESTRICT, które zablokują
        twarde usunięcie tej umiejętności.

        Żadna tabela nie referencjonuje `skills` z ON DELETE RESTRICT — obie
        przyszłe tabele łącznikowe (`job_skills`, `worker_skills`, Faza 3) są
        ON DELETE CASCADE, więc formalnie nigdy nie zablokują usunięcia; ta
        metoda istnieje dla symetrii z JobRepository i na wypadek, gdyby
        któraś z tych relacji zmieniła się na RESTRICT w przyszłości.
        """
        return {}

    def delete(self, skill_id: str) -> bool:
        """Usuń umiejętność (twardo — tabele słownikowe nie mają soft-delete)."""
        blocking = self.count_blocking_references(skill_id)
        blocked_by = {k: v for k, v in blocking.items() if v}
        if blocked_by:
            details = ', '.join(f'{v} {k}' for k, v in blocked_by.items())
            raise ConflictError(
                f'Nie można usunąć umiejętności "{skill_id}" — jest w użyciu ({details}).'
            )

        existing = self.get_by_id(skill_id)
        query = "DELETE FROM skills WHERE id = %s"
        cursor = self._execute(query, (skill_id,))
        deleted = cursor.rowcount > 0
        if deleted and existing:
            self._audit('DELETE', skill_id, label=existing['description'])
        return deleted
