"""
Repository dla szkoleń BHP pracownika (bhp_trainings, BHP_4/5).

Struktura analogiczna do MedicalExamRepository (wiele wierszy na
pracownika, pełne CRUD po id wiersza) — patrz jej docstring. Brak kolumny
`description`: `kind` (Initial/Periodic/Control) już mówi, czym jest dane
szkolenie BHP (patrz komentarz w migracji dbd528235721).
"""
from datetime import date
from typing import Any, List, Optional

from exceptions import ConflictError
from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT id, worker_id, training_date, valid_until, kind, created_at, updated_at
    FROM bhp_trainings
"""

_KIND_LABELS_PL = {'Initial': 'wstępne', 'Periodic': 'okresowe', 'Control': 'kontrolne'}


class BhpTrainingRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('bhp_trainings')

    def get_all_for_worker(self, worker_id: str) -> List[Any]:
        """BHP_4 — jednego pracownika szkolenia, najpilniejsze
        (najwcześniej wygasające) najpierw; bezterminowe na końcu."""
        return self._fetch_all(
            _SELECT + " WHERE worker_id = %s ORDER BY valid_until ASC NULLS LAST, training_date DESC",
            (worker_id,),
        )

    def get_by_id(self, training_id: int) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE id = %s", (training_id,))
        return rows[0] if rows else None

    def _conflicting_valid_training(self, worker_id: str, kind: str, exclude_id: Optional[int] = None) -> Optional[Any]:
        """'At most one currently-valid training per (worker, kind)' guard
        — see MedicalExamRepository._conflicting_valid_exam's docstring for
        why this can't be a DB partial-unique-index."""
        query = (
            "SELECT id FROM bhp_trainings WHERE worker_id = %s AND kind = %s "
            "AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)"
        )
        params: list = [worker_id, kind]
        if exclude_id is not None:
            query += " AND id != %s"
            params.append(exclude_id)
        return self._fetch_one(query, tuple(params))

    def create(self, worker_id: str, training_date: date, valid_until: Optional[date], kind: str) -> int:
        is_currently_valid = valid_until is None or valid_until >= date.today()
        if is_currently_valid and self._conflicting_valid_training(worker_id, kind):
            raise ConflictError(
                f'Pracownik ma już ważne szkolenie tego rodzaju ({_KIND_LABELS_PL.get(kind, kind)}) — '
                'nie można dodać kolejnego, dopóki obecne nie wygaśnie.'
            )
        new_id = self._execute_insert(
            "INSERT INTO bhp_trainings (worker_id, training_date, valid_until, kind) VALUES (%s, %s, %s, %s)",
            (worker_id, training_date, valid_until, kind),
        )
        self._audit('CREATE', worker_id, label=kind, field_name='bhp_trainings', new=f'{kind} / {training_date}')
        return new_id

    def update(self, training_id: int, training_date: date, valid_until: Optional[date], kind: str) -> bool:
        existing = self.get_by_id(training_id)
        if not existing:
            return False
        is_currently_valid = valid_until is None or valid_until >= date.today()
        if is_currently_valid and self._conflicting_valid_training(existing['worker_id'], kind, exclude_id=training_id):
            raise ConflictError(
                f'Pracownik ma już ważne szkolenie tego rodzaju ({_KIND_LABELS_PL.get(kind, kind)}) — '
                'nie można zapisać kolejnego, dopóki obecne nie wygaśnie.'
            )
        cursor = self._execute(
            "UPDATE bhp_trainings SET training_date = %s, valid_until = %s, kind = %s, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (training_date, valid_until, kind, training_id),
        )
        self._audit(
            'UPDATE', existing['worker_id'], label=kind,
            field_name='bhp_trainings', old=existing['kind'], new=kind,
        )
        return cursor.rowcount > 0

    def delete(self, training_id: int) -> bool:
        existing = self.get_by_id(training_id)
        if not existing:
            return False
        cursor = self._execute("DELETE FROM bhp_trainings WHERE id = %s", (training_id,))
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', existing['worker_id'], label=existing['kind'], field_name='bhp_trainings')
        return deleted

    def get_expiring(self, days_threshold: int = 30) -> List[Any]:
        """BHP_5 — szkolenia wygasające w ciągu `days_threshold` dni (lub
        już wygasłe), tylko aktywni pracownicy."""
        query = """
            SELECT bt.id, bt.worker_id, w.firstname, w.surname,
                   bt.training_date, bt.valid_until, bt.kind
            FROM bhp_trainings bt
            JOIN workers w ON w.id = bt.worker_id
            WHERE bt.valid_until IS NOT NULL
              AND bt.valid_until <= CURRENT_DATE + (%s || ' days')::INTERVAL
              AND w.fire_date IS NULL
            ORDER BY bt.valid_until ASC
        """
        return self._fetch_all(query, (days_threshold,))
