"""
Repository dla danych dokumentów cudzoziemca (foreigner_data, WRK_5).

Jeden wiersz na pracownika (UNIQUE(worker_id)), opcjonalny — nie każdy
pracownik jest cudzoziemcem. delete_by_worker() obsługuje przypadek, gdy
formularz czyści tę sekcję (pracownik przestał być cudzoziemcem / błędny
wpis), skoro brak danych to prawidłowy stan, nie błąd.
"""
from datetime import date
from typing import Any, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class ForeignerDataRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('foreigner_data')

    def get_by_worker(self, worker_id: str) -> Optional[Any]:
        return self._fetch_one(
            "SELECT id, worker_id, document_kind, document_validity, "
            "employment_basis, employment_basis_validity, created_at, updated_at "
            "FROM foreigner_data WHERE worker_id = %s",
            (worker_id,),
        )

    def upsert(
        self, worker_id: str, document_kind: Optional[str], document_validity: Optional[date],
        employment_basis: Optional[str], employment_basis_validity: Optional[date],
    ) -> None:
        query = """
            INSERT INTO foreigner_data
                (worker_id, document_kind, document_validity, employment_basis, employment_basis_validity)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (worker_id) DO UPDATE
                SET document_kind = EXCLUDED.document_kind,
                    document_validity = EXCLUDED.document_validity,
                    employment_basis = EXCLUDED.employment_basis,
                    employment_basis_validity = EXCLUDED.employment_basis_validity,
                    updated_at = CURRENT_TIMESTAMP
        """
        self._execute(query, (worker_id, document_kind, document_validity, employment_basis, employment_basis_validity))
        self._audit('UPDATE', worker_id, field_name='foreigner_data', new=f'{document_kind} / {document_validity}')

    def delete_by_worker(self, worker_id: str) -> None:
        cursor = self._execute("DELETE FROM foreigner_data WHERE worker_id = %s", (worker_id,))
        if cursor.rowcount > 0:
            self._audit('DELETE', worker_id, field_name='foreigner_data')

    def get_expiring(self, days_threshold: int = 30) -> list:
        """Workers whose document_validity falls within `days_threshold` days
        from today (WRK_10) — includes already-expired documents (< today),
        not just the upcoming window, so nothing silently drops off the
        report the day after it expires."""
        query = """
            SELECT fd.worker_id, w.firstname, w.surname, fd.document_kind, fd.document_validity
            FROM foreigner_data fd
            JOIN workers w ON w.id = fd.worker_id
            WHERE fd.document_validity IS NOT NULL
              AND fd.document_validity <= CURRENT_DATE + (%s || ' days')::INTERVAL
              AND w.fire_date IS NULL
            ORDER BY fd.document_validity ASC
        """
        return self._fetch_all(query, (days_threshold,))
