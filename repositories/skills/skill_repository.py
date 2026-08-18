"""
Repository dla umiejętności (skills) — słownik domeny Staamp HR (IMPLEMENTATION_PLAN.md §6).
Lustrzane odbicie repositories/jobs/job_repository.py — patrz tamten plik po
pełne uzasadnienie wzorca (AuditableMixin + BaseRepository, klucz naturalny TEXT).
"""
from typing import Any, List, Optional

from exceptions import ConflictError
from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class SkillRepository(AuditableMixin, BaseRepository):
    """Repository dla umiejętności. Klucz naturalny TEXT (id = kod
    umiejętności, np. "0002", dziedziczony z legacy SQLite)."""

    audit_entity_type = 'skill'
    _columns = 'id, description, created_at, updated_at'

    def __init__(self):
        super().__init__('skills')

    def get_all(self, search: Optional[str] = None) -> List[Any]:
        """Lista umiejętności, opcjonalnie filtrowana po id/opisie (SKL_1)."""
        query = f"SELECT {self._columns} FROM skills"
        params: tuple = ()
        if search:
            query += " WHERE id ILIKE %s OR description ILIKE %s"
            like = f"%{search}%"
            params = (like, like)
        query += " ORDER BY id"
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
