"""Repository dla wypowiedzeń (worker_terminations) — "Złożenie wypowiedzenia"

Zastępuje dawny natychmiastowy przycisk "Dezaktywuj": HR składa
wypowiedzenie (data złożenia + przyczyna + okres wypowiedzenia), a
`workers.fire_date` ustawia się dopiero gdy `planned_fire_date` faktycznie
nadejdzie (services/worker_service.py's finalize_due_terminations — brak
schedulera w tej aplikacji, patrz config/runtime_guards.py, więc
"automatyczna" zmiana statusu jest ewaluowana leniwie na ścieżkach odczytu,
tak samo jak needs_attention/alert bucketing gdzie indziej w tym kodzie).
"""
from datetime import date, timedelta
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT_BASE = """
    SELECT t.id, t.worker_id, w.firstname, w.surname, t.submission_date, t.reason,
           t.notice_period_days, t.default_notice_period_days, t.shortening_reason,
           t.planned_fire_date, t.status, t.created_at, t.updated_at
    FROM worker_terminations t
    JOIN workers w ON w.id = t.worker_id
"""


class WorkerTerminationRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker_termination'

    def __init__(self):
        super().__init__('worker_terminations')

    def create(
        self, *, worker_id: str, submission_date: date, reason: str,
        notice_period_days: int, default_notice_period_days: int,
        shortening_reason: Optional[str], planned_fire_date: date,
    ) -> int:
        """Caller (services/worker_service.py) is expected to have already
        checked there's no other pending notice for this worker — the
        partial unique index (migration k1l2m3n4o5p6) is the last-resort
        guard against a race, not the primary check."""
        query = """
            INSERT INTO worker_terminations
                (worker_id, submission_date, reason, notice_period_days,
                 default_notice_period_days, shortening_reason, planned_fire_date, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
        """
        new_id = self._execute_insert(
            query,
            (worker_id, submission_date, reason, notice_period_days,
             default_notice_period_days, shortening_reason, planned_fire_date),
        )
        self._audit('CREATE', new_id, label=f'{worker_id} -> {planned_fire_date.isoformat()}')
        return new_id

    def get_by_id(self, termination_id: int) -> Optional[Any]:
        return self._fetch_one(_SELECT_BASE + " WHERE t.id = %s", (termination_id,))

    def get_pending_by_worker(self, worker_id: str) -> Optional[Any]:
        """At most one row, by the partial unique index — WorkerViewPage's
        "wypowiedzenie złożone" panel and submit_termination's own
        pre-create conflict check both read through here."""
        return self._fetch_one(
            _SELECT_BASE + " WHERE t.worker_id = %s AND t.status = 'pending'", (worker_id,),
        )

    def get_due(self, as_of: date) -> List[Any]:
        """Pending notices whose planned_fire_date has been reached —
        finalize_due_terminations' sweep set."""
        return self._fetch_all(
            _SELECT_BASE + " WHERE t.status = 'pending' AND t.planned_fire_date <= %s ORDER BY t.planned_fire_date",
            (as_of,),
        )

    def get_upcoming(self, *, as_of: date, days: int) -> List[Any]:
        """Pending notices whose planned_fire_date falls within the next
        `days` days (inclusive) — the pulpit's "14 dni do zwolnienia"
        section. Already-due rows (planned_fire_date <= as_of) still show
        here too, on the assumption finalize_due_terminations runs before
        this on the same request (dashboard_service.get_alerts) — a
        just-reached notice shouldn't vanish from the panel before the
        page reflects the now-inactive status."""
        query = _SELECT_BASE + """
            WHERE t.status = 'pending' AND t.planned_fire_date <= %s
            ORDER BY t.planned_fire_date
        """
        return self._fetch_all(query, (as_of + timedelta(days=days),))

    def finalize(self, termination_id: int) -> bool:
        cursor = self._execute(
            "UPDATE worker_terminations SET status = 'finalized', updated_at = CURRENT_TIMESTAMP WHERE id = %s AND status = 'pending'",
            (termination_id,),
        )
        finalized = cursor.rowcount > 0
        if finalized:
            self._audit('UPDATE', termination_id, field_name='status', old='pending', new='finalized')
        return finalized
