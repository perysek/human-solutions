"""Repository for worker_absences — the request / manual absence record.

Ported from the golden standard's AbsenceRepository (faktura_scanner_flask
branch invoices-app). Dropped entirely: get_overlapping_appointments and the
"hidden owner" admin-view exclusion — this app has no client-appointment
scheduling and no equivalent owner-hiding feature. worker_id is TEXT here
(golden standard's employee_id is INTEGER), so ids pass through as plain
strings, no int() casts.
"""
from datetime import date, time
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_COLUMNS = (
    "wa.id, wa.worker_id, wa.category_id, wa.date_from, wa.date_to, "
    "wa.time_from, wa.time_to, wa.approver_worker_id, wa.status, "
    "wa.rejection_reason, wa.notes, wa.source, "
    "wa.requested_at, wa.responded_at, wa.created_by, "
    "wa.is_deleted, wa.deleted_at, wa.created_at, wa.updated_at"
)


class WorkerAbsenceRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker_absence'

    def __init__(self):
        super().__init__('worker_absences')

    # ── reads ─────────────────────────────────────────────────────────────────

    def get_by_id(self, absence_id: int) -> Optional[Any]:
        """Includes soft-deleted rows — the caller decides what to do with them."""
        query = f"""
            SELECT {_COLUMNS},
                   ac.name AS category_name, ac.absence_full_day,
                   w.firstname || ' ' || w.surname AS worker_name,
                   sup.firstname || ' ' || sup.surname AS approver_name
            FROM worker_absences wa
            JOIN worker_absence_categories ac ON ac.id = wa.category_id
            JOIN workers w ON w.id = wa.worker_id
            LEFT JOIN workers sup ON sup.id = wa.approver_worker_id
            WHERE wa.id = %s
        """
        return self._fetch_one(query, (absence_id,))

    def list_for_worker(self, worker_id: str, status_in: Optional[List[str]] = None) -> List[Any]:
        params: list = [worker_id]
        status_clause = ''
        if status_in:
            placeholders = ','.join(['%s'] * len(status_in))
            status_clause = f'AND wa.status IN ({placeholders})'
            params.extend(status_in)

        query = f"""
            SELECT {_COLUMNS},
                   ac.name AS category_name, ac.absence_full_day,
                   sup.firstname || ' ' || sup.surname AS approver_name
            FROM worker_absences wa
            JOIN worker_absence_categories ac ON ac.id = wa.category_id
            LEFT JOIN workers sup ON sup.id = wa.approver_worker_id
            WHERE wa.worker_id = %s AND wa.is_deleted = FALSE {status_clause}
            ORDER BY wa.date_from DESC, wa.requested_at DESC
        """
        return self._fetch_all(query, tuple(params))

    def list_for_approver(self, approver_worker_id: str, status_in: Optional[List[str]] = None) -> List[Any]:
        params: list = [approver_worker_id]
        status_clause = ''
        if status_in:
            placeholders = ','.join(['%s'] * len(status_in))
            status_clause = f'AND wa.status IN ({placeholders})'
            params.extend(status_in)

        query = f"""
            SELECT {_COLUMNS},
                   ac.name AS category_name, ac.absence_full_day,
                   w.firstname || ' ' || w.surname AS worker_name
            FROM worker_absences wa
            JOIN worker_absence_categories ac ON ac.id = wa.category_id
            JOIN workers w ON w.id = wa.worker_id
            WHERE wa.approver_worker_id = %s AND wa.is_deleted = FALSE {status_clause}
            ORDER BY wa.requested_at DESC
        """
        return self._fetch_all(query, tuple(params))

    def count_pending_for_approver(self, approver_worker_id: str) -> int:
        row = self._fetch_one(
            "SELECT COUNT(*) AS cnt FROM worker_absences "
            "WHERE approver_worker_id = %s AND status = 'pending' AND is_deleted = FALSE",
            (approver_worker_id,),
        )
        return row['cnt'] if row else 0

    def list_all(
        self, status_in: Optional[List[str]] = None, worker_id: Optional[str] = None,
        date_from: Optional[date] = None, date_to: Optional[date] = None,
        include_deleted: bool = False,
    ) -> List[Any]:
        params: list = []
        clauses: list = []

        if not include_deleted:
            clauses.append('wa.is_deleted = FALSE')
        if status_in:
            placeholders = ','.join(['%s'] * len(status_in))
            clauses.append(f'wa.status IN ({placeholders})')
            params.extend(status_in)
        if worker_id is not None:
            clauses.append('wa.worker_id = %s')
            params.append(worker_id)
        if date_from is not None:
            clauses.append('wa.date_to >= %s')
            params.append(date_from)
        if date_to is not None:
            clauses.append('wa.date_from <= %s')
            params.append(date_to)

        where = ('WHERE ' + ' AND '.join(clauses)) if clauses else ''
        query = f"""
            SELECT {_COLUMNS},
                   ac.name AS category_name, ac.absence_full_day,
                   w.firstname || ' ' || w.surname AS worker_name,
                   sup.firstname || ' ' || sup.surname AS approver_name
            FROM worker_absences wa
            JOIN worker_absence_categories ac ON ac.id = wa.category_id
            JOIN workers w ON w.id = wa.worker_id
            LEFT JOIN workers sup ON sup.id = wa.approver_worker_id
            {where}
            ORDER BY wa.date_from DESC, wa.requested_at DESC
        """
        return self._fetch_all(query, tuple(params))

    def has_approved_absence_in_range(self, worker_id: str, date_from: date, date_to: date) -> bool:
        """Used by worker_absence_service.resolve_reviewer's org-structure
        escalation: does this candidate reviewer have an approved (not
        merely pending) absence overlapping the given window? Deliberately
        narrower than check_absence_conflicts (status='approved' only,
        no time-slot handling) — an escalation decision cares whether the
        supervisor will actually be out, not whether they have a pending
        request of their own."""
        row = self._fetch_one(
            """
            SELECT 1 FROM worker_absences
            WHERE worker_id = %s AND is_deleted = FALSE AND status = 'approved'
              AND date_from <= %s AND date_to >= %s
            LIMIT 1
            """,
            (worker_id, date_to, date_from),
        )
        return row is not None

    # ── conflict detection (absence-vs-absence only — no appointments here) ────

    def check_absence_conflicts(
        self, worker_id: str, date_from: date, date_to: date,
        time_from: Optional[time] = None, time_to: Optional[time] = None,
        exclude_id: Optional[int] = None,
    ) -> List[Any]:
        params: list = [worker_id, date_to, date_from]

        if time_from is None:
            time_clause = ''
        else:
            time_clause = "AND (wa.time_from IS NULL OR (wa.time_from < %s AND wa.time_to > %s))"
            params.extend([time_to, time_from])

        exclude_clause = ''
        if exclude_id is not None:
            exclude_clause = 'AND wa.id != %s'
            params.append(exclude_id)

        query = f"""
            SELECT wa.id, wa.date_from, wa.date_to, wa.time_from, wa.time_to,
                   wa.status, ac.name AS category_name
            FROM worker_absences wa
            JOIN worker_absence_categories ac ON ac.id = wa.category_id
            WHERE wa.worker_id = %s
              AND wa.is_deleted = FALSE
              AND wa.status IN ('pending', 'approved')
              AND wa.date_from <= %s
              AND wa.date_to   >= %s
              {time_clause}
              {exclude_clause}
        """
        return self._fetch_all(query, tuple(params))

    # ── writes ────────────────────────────────────────────────────────────────

    def create(
        self, *, worker_id: str, category_id: int, date_from: date, date_to: date,
        time_from: Optional[time], time_to: Optional[time],
        approver_worker_id: Optional[str], status: str, notes: Optional[str],
        source: str, created_by: Optional[int],
    ) -> int:
        query = """
            INSERT INTO worker_absences (
                worker_id, category_id, date_from, date_to, time_from, time_to,
                approver_worker_id, status, notes, source, created_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        new_id = self._execute_insert(query, (
            worker_id, category_id, date_from, date_to, time_from, time_to,
            approver_worker_id, status, notes, source, created_by,
        ))
        self._audit('CREATE', new_id, label=f'{worker_id} — {date_from}→{date_to}',
                     field_name='status', new=status)
        return new_id

    def update_manual(
        self, absence_id: int, *, category_id: int, date_from: date, date_to: date,
        time_from: Optional[time], time_to: Optional[time], notes: Optional[str],
    ) -> bool:
        """Only 'manual'-source records are editable — enforced by the service."""
        query = """
            UPDATE worker_absences
            SET category_id = %s, date_from = %s, date_to = %s,
                time_from = %s, time_to = %s, notes = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND is_deleted = FALSE
        """
        cursor = self._execute(query, (category_id, date_from, date_to, time_from, time_to, notes, absence_id))
        updated = cursor.rowcount > 0
        if updated:
            self._audit('UPDATE', absence_id, field_name='category_id')
        return updated

    def respond(
        self, absence_id: int, status: str, approver_worker_id: str,
        rejection_reason: Optional[str] = None,
    ) -> bool:
        query = """
            UPDATE worker_absences
            SET status = %s, approver_worker_id = %s, rejection_reason = %s,
                responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND is_deleted = FALSE
        """
        cursor = self._execute(query, (status, approver_worker_id, rejection_reason, absence_id))
        responded = cursor.rowcount > 0
        if responded:
            self._audit('UPDATE', absence_id, field_name='status', new=status)
        return responded

    def cancel(self, absence_id: int) -> bool:
        """Cancel own request — only while status='pending'."""
        cursor = self._execute(
            "UPDATE worker_absences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
            "WHERE id = %s AND status = 'pending' AND is_deleted = FALSE",
            (absence_id,),
        )
        cancelled = cursor.rowcount > 0
        if cancelled:
            self._audit('UPDATE', absence_id, field_name='status', old='pending', new='cancelled')
        return cancelled

    def cancel_approved(self, absence_id: int) -> bool:
        cursor = self._execute(
            "UPDATE worker_absences SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP "
            "WHERE id = %s AND status = 'approved' AND is_deleted = FALSE",
            (absence_id,),
        )
        cancelled = cursor.rowcount > 0
        if cancelled:
            self._audit('UPDATE', absence_id, field_name='status', old='approved', new='cancelled')
        return cancelled

    def soft_delete(self, absence_id: int) -> bool:
        cursor = self._execute(
            "UPDATE worker_absences SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, "
            "updated_at = CURRENT_TIMESTAMP WHERE id = %s AND is_deleted = FALSE",
            (absence_id,),
        )
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', absence_id, field_name='is_deleted', old='false', new='true')
        return deleted

    def hard_delete(self, absence_id: int) -> bool:
        cursor = self._execute("DELETE FROM worker_absences WHERE id = %s", (absence_id,))
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', absence_id, field_name='status', new='deleted', critical=True)
        return deleted
