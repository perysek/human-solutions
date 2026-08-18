"""
Repository dla obywatelstw pracownika (worker_nationality, WRK_4).

W przeciwieństwie do birth_data/foreigner_data — NIE jeden wiersz na
pracownika: "obsługa wielu narodowości" (WRK_4) oznacza 0..N wierszy.
replace_all() zastępuje cały zestaw naraz, co pasuje do formularza, gdzie
użytkownik edytuje listę narodowości jako całość, a nie pojedynczy wiersz.
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class WorkerNationalityRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('worker_nationality')

    def get_by_worker(self, worker_id: str) -> List[Any]:
        return self._fetch_all(
            "SELECT id, worker_id, nationality, created_at, updated_at "
            "FROM worker_nationality WHERE worker_id = %s ORDER BY id",
            (worker_id,),
        )

    def replace_all(self, worker_id: str, nationalities: List[str]) -> None:
        """Delete this worker's existing nationality rows and insert the new
        set. Deduplicates (case-sensitive exact match) so a form submitting
        the same value twice doesn't create redundant rows."""
        self._execute("DELETE FROM worker_nationality WHERE worker_id = %s", (worker_id,))
        seen = set()
        for nationality in nationalities:
            value = (nationality or '').strip()
            if not value or value in seen:
                continue
            seen.add(value)
            self._execute(
                "INSERT INTO worker_nationality (worker_id, nationality) VALUES (%s, %s)",
                (worker_id, value),
            )
        self._audit('UPDATE', worker_id, field_name='worker_nationality', new=', '.join(sorted(seen)))
