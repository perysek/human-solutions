"""
Repository dla uczestników szkolenia (training_participants) —
IMPLEMENTATION_PLAN.md §10. Największa tabela w schemacie (~6612 wierszy per
plan) — stąd indeksy na wszystkich trzech FK (migracja
7e2feddd7715_create_trainings_tables.py) i brak jakiejkolwiek pętli
per-wiersz w tym pliku.

Audytowane pod audit_entity_type='training' z entity_id=training_id (nie
'training_participant', nie participant.id) — zmiana zapisu uczestnika
pojawia się w śladzie audytowym *szkolenia*, tak samo jak job_skills
audytowane są pod encją stanowiska (IMPLEMENTATION_PLAN.md §10).
"""
from datetime import date
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT tp.id, tp.training_id, tp.worker_id, w.firstname AS worker_firstname, w.surname AS worker_surname,
           tp.start_date, tp.finish_date, tp.remarks, tp.trainer_id,
           tr.firstname AS trainer_firstname, tr.surname AS trainer_surname,
           tp.effectiveness_date, tp.created_at, tp.updated_at
    FROM training_participants tp
    JOIN workers w ON w.id = tp.worker_id
    LEFT JOIN workers tr ON tr.id = tp.trainer_id
"""

_EXPORT_SELECT = """
    SELECT tp.id, tp.worker_id, w.firstname AS worker_firstname, w.surname AS worker_surname,
           j.description AS job_description, tp.start_date, tp.finish_date, tp.remarks,
           tp.trainer_id, tr.firstname AS trainer_firstname, tr.surname AS trainer_surname,
           tp.effectiveness_date
    FROM training_participants tp
    JOIN workers w ON w.id = tp.worker_id
    LEFT JOIN jobs j ON j.id = w.job_id
    LEFT JOIN workers tr ON tr.id = tp.trainer_id
"""

_HISTORY_SELECT = """
    SELECT tp.id, tp.training_id, t.description AS training_description, t.training_date,
           tp.start_date, tp.finish_date, tp.remarks, tp.trainer_id,
           tr.firstname AS trainer_firstname, tr.surname AS trainer_surname,
           tp.effectiveness_date
    FROM training_participants tp
    JOIN trainings t ON t.id = tp.training_id
    LEFT JOIN workers tr ON tr.id = tp.trainer_id
"""


class TrainingParticipantRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'
    _soft_delete = True  # delete() below rides BaseRepository's is_deleted/deleted_at UPDATE

    def __init__(self):
        super().__init__('training_participants')

    def get_by_training(self, training_id: int) -> List[Any]:
        """TRN_5 — uczestnicy jednego szkolenia, posortowani rosnąco po dacie
        oceny skuteczności (brakująca data — jeszcze nieoceniony — na końcu,
        NULLS LAST); nazwisko/imię jako tie-breaker dla wierszy bez tej
        daty, żeby kolejność była stabilna, nie zależna od id."""
        return self._fetch_all(
            _SELECT + " WHERE tp.training_id = %s AND NOT tp.is_deleted "
            "ORDER BY tp.effectiveness_date ASC NULLS LAST, w.surname, w.firstname",
            (training_id,),
        )

    def get_by_id(self, participant_id: int) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE tp.id = %s AND NOT tp.is_deleted", (participant_id,))
        return rows[0] if rows else None

    def exists_active(self, training_id: int, worker_id: str) -> bool:
        """Pre-insert duplicate check for register_participant — is this
        worker already a non-deleted participant of this training? Backed by
        idx_training_participants_training_worker_active (migration
        a7b8c9d0e1f2) as the authoritative guarantee; this is the friendly
        ConflictError path so a duplicate-add attempt doesn't surface as a
        raw 500 from the DB constraint."""
        row = self._fetch_one(
            "SELECT 1 FROM training_participants WHERE training_id = %s AND worker_id = %s AND NOT is_deleted LIMIT 1",
            (training_id, worker_id),
        )
        return row is not None

    def get_export_rows(self, training_id: int) -> List[Any]:
        """TRN_11 — CSV export source rows: every training_participants
        field plus the worker's name and job description (OQ_4's confirmed
        column set), one query rather than the JSON list's separate
        per-purpose SELECT."""
        return self._fetch_all(
            _EXPORT_SELECT + " WHERE tp.training_id = %s AND NOT tp.is_deleted ORDER BY w.surname, w.firstname", (training_id,),
        )

    def get_by_worker(self, worker_id: str) -> List[Any]:
        """TRN_10 — historia szkoleń jednego pracownika, najnowsze pierwsze."""
        return self._fetch_all(
            _HISTORY_SELECT + " WHERE tp.worker_id = %s AND NOT tp.is_deleted ORDER BY t.training_date DESC NULLS LAST, tp.id DESC",
            (worker_id,),
        )

    def delete(self, participant_id: int) -> bool:
        """Soft-delete (BaseRepository.delete() with _soft_delete=True sets
        is_deleted/deleted_at rather than removing the row) + an explicit
        DELETE audit entry, same shape as ActionPlanRepository.delete —
        AuditableMixin's _audit isn't called by the inherited delete()."""
        existing = self.get_by_id(participant_id)
        if not existing:
            return False
        deleted = super().delete(participant_id)
        if deleted:
            self._audit('DELETE', existing['training_id'], label=existing['worker_id'])
        return deleted

    def create(
        self, training_id: int, worker_id: str, start_date: Optional[date], finish_date: Optional[date],
        remarks: Optional[str], trainer_id: Optional[str],
    ) -> int:
        """TRN_8 — zarejestruj uczestnika. `effectiveness_date` celowo nie
        jest tu parametrem: PRD wiąże ją z późniejszą oceną skuteczności
        szkolenia (TRN_9), nie z samą rejestracją."""
        new_id = self._execute_insert(
            "INSERT INTO training_participants (training_id, worker_id, start_date, finish_date, remarks, trainer_id) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (training_id, worker_id, start_date, finish_date, remarks, trainer_id),
        )
        self._audit('CREATE', training_id, label=worker_id)
        return new_id

    def update(
        self, participant_id: int, start_date: Optional[date], finish_date: Optional[date],
        remarks: Optional[str], trainer_id: Optional[str], effectiveness_date: Optional[date],
    ) -> bool:
        """TRN_8/9 — jeden endpoint, wszystkie edytowalne pola uczestnika
        naraz (włącznie z effectiveness_date) — PUT /api/participants/<id>
        nie rozróżnia "edycji wyniku" od "wpisania skuteczności", to ten sam
        wiersz i ten sam formularz po stronie frontendu."""
        existing = self.get_by_id(participant_id)
        if not existing:
            return False
        self._execute(
            "UPDATE training_participants SET start_date = %s, finish_date = %s, remarks = %s, "
            "trainer_id = %s, effectiveness_date = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (start_date, finish_date, remarks, trainer_id, effectiveness_date, participant_id),
        )
        self._audit('UPDATE', existing['training_id'], label=existing['worker_id'])
        return True
