"""
Repository dla badań lekarskich pracownika (medical_exams, MED_5/6).

Wiele wierszy na pracownika (jedno badanie = jeden wiersz), w
przeciwieństwie do worker_skills (jeden wiersz na parę worker/skill) —
stąd pełne CRUD po id wiersza, nie upsert po kluczu złożonym.
Audytowane pod audit_entity_type='worker' z entity_id=worker_id, tak samo
jak pozostałe repozytoria pod-zasobów pracownika (Faza 2/3).
"""
from datetime import date
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT id, worker_id, description, performed_on, valid_until, kind, created_at, updated_at
    FROM medical_exams
"""


class MedicalExamRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('medical_exams')

    def get_all_for_worker(self, worker_id: str) -> List[Any]:
        """MED_5 — jednego pracownika badania, najpilniejsze (najwcześniej
        wygasające) najpierw; bezterminowe (valid_until IS NULL) na końcu."""
        return self._fetch_all(
            _SELECT + " WHERE worker_id = %s ORDER BY valid_until ASC NULLS LAST, performed_on DESC",
            (worker_id,),
        )

    def get_by_id(self, exam_id: int) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE id = %s", (exam_id,))
        return rows[0] if rows else None

    def create(
        self, worker_id: str, description: Optional[str], performed_on: date,
        valid_until: Optional[date], kind: str,
    ) -> int:
        new_id = self._execute_insert(
            "INSERT INTO medical_exams (worker_id, description, performed_on, valid_until, kind) "
            "VALUES (%s, %s, %s, %s, %s)",
            (worker_id, description, performed_on, valid_until, kind),
        )
        self._audit('CREATE', worker_id, label=kind, field_name='medical_exams', new=f'{kind} / {performed_on}')
        return new_id

    def update(
        self, exam_id: int, description: Optional[str], performed_on: date,
        valid_until: Optional[date], kind: str,
    ) -> bool:
        existing = self.get_by_id(exam_id)
        if not existing:
            return False
        cursor = self._execute(
            "UPDATE medical_exams SET description = %s, performed_on = %s, valid_until = %s, "
            "kind = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (description, performed_on, valid_until, kind, exam_id),
        )
        self._audit(
            'UPDATE', existing['worker_id'], label=kind,
            field_name='medical_exams', old=existing['kind'], new=kind,
        )
        return cursor.rowcount > 0

    def delete(self, exam_id: int) -> bool:
        existing = self.get_by_id(exam_id)
        if not existing:
            return False
        cursor = self._execute("DELETE FROM medical_exams WHERE id = %s", (exam_id,))
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', existing['worker_id'], label=existing['kind'], field_name='medical_exams')
        return deleted

    def get_expiring(self, days_threshold: int = 30) -> List[Any]:
        """MED_6 — badania wygasające w ciągu `days_threshold` dni (lub już
        wygasłe), tylko aktywni pracownicy. Ta sama forma zapytania co
        ForeignerDataRepository.get_expiring (WRK_10)."""
        query = """
            SELECT me.id, me.worker_id, w.firstname, w.surname, me.description,
                   me.performed_on, me.valid_until, me.kind
            FROM medical_exams me
            JOIN workers w ON w.id = me.worker_id
            WHERE me.valid_until IS NOT NULL
              AND me.valid_until <= CURRENT_DATE + (%s || ' days')::INTERVAL
              AND w.fire_date IS NULL
            ORDER BY me.valid_until ASC
        """
        return self._fetch_all(query, (days_threshold,))
