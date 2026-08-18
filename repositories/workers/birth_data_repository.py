"""
Repository dla danych urodzenia pracownika (birth_data, WRK_3).

Cienkie, jednoprzeznaczeniowe repozytorium — jeden wiersz na pracownika
(UNIQUE(worker_id)). Audytowane pod audit_entity_type='worker' z
entity_id=worker_id (nie 'birth_data'), żeby korekta daty urodzenia
pojawiała się w śladzie audytowym *pracownika*, zgodnie z
IMPLEMENTATION_PLAN.md §7.
"""
from datetime import date
from typing import Any, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class BirthDataRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('birth_data')

    def get_by_worker(self, worker_id: str) -> Optional[Any]:
        return self._fetch_one(
            "SELECT id, worker_id, birth_date, birth_place, created_at, updated_at "
            "FROM birth_data WHERE worker_id = %s",
            (worker_id,),
        )

    def upsert(self, worker_id: str, birth_date: Optional[date], birth_place: Optional[str]) -> None:
        """Create or replace the one birth_data row for this worker."""
        query = """
            INSERT INTO birth_data (worker_id, birth_date, birth_place)
            VALUES (%s, %s, %s)
            ON CONFLICT (worker_id) DO UPDATE
                SET birth_date = EXCLUDED.birth_date,
                    birth_place = EXCLUDED.birth_place,
                    updated_at = CURRENT_TIMESTAMP
        """
        self._execute(query, (worker_id, birth_date, birth_place))
        self._audit('UPDATE', worker_id, field_name='birth_data', new=f'{birth_date} / {birth_place}')
