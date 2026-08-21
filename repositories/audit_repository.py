"""
Repository dla historii zmian (audit log)
"""
import logging
from typing import List, Optional, Union

from repositories.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class AuditRepository(BaseRepository):
    """Repository dla audit log"""

    def __init__(self):
        super().__init__("audit_log")

    def log_event(
        self,
        entity_type: str,
        action: str,
        # int for surrogate-key entities (invoices, users, ...), str for the
        # Staamp domain's natural TEXT keys (jobs, skills, workers, ...) —
        # audit_log.entity_id is TEXT (widened by
        # e4f5a6b7c8d9_widen_audit_log_entity_id_to_text) precisely to hold both.
        entity_id: Optional[Union[int, str]] = None,
        entity_label: Optional[str] = None,
        field_name: Optional[str] = None,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        user_id: Optional[int] = None,
        user_name: Optional[str] = None,
        invoice_id: Optional[int] = None,
    ):
        """Zapisz zdarzenie dla dowolnej encji aplikacji"""
        query = """
            INSERT INTO audit_log
                (entity_type, entity_id, entity_label, invoice_id,
                 action, field_name, old_value, new_value, user_id, user_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        self._execute(query, (
            entity_type, entity_id, entity_label, invoice_id,
            action, field_name, old_value, new_value, user_id, user_name,
        ))

    def safe_log_event(self, *, critical: bool = False, **kwargs) -> bool:
        """Log an audit event without ever silently losing it.

        The previous call sites used ``try: log_event(...) except Exception: pass``,
        which made a failed audit write indistinguishable from a successful one —
        fatal for a system whose audit trail is a financial/PII forensic artifact.

        On failure:
          - ``critical=False`` (default): log at ERROR so the dropped write surfaces
            in monitoring, but do NOT disrupt the business operation. Returns False.
          - ``critical=True``: re-raise, so the caller fails rather than proceeding
            un-audited (use for sensitive financial/RBAC mutations).

        Returns True on success, False on a swallowed (non-critical) failure.
        """
        try:
            self.log_event(**kwargs)
            return True
        except Exception:
            logger.error("AUDIT WRITE FAILED: %s", kwargs, exc_info=True)
            if critical:
                raise
            return False

    def log_change(
        self, invoice_id: int, field_name: str, old_value: str,
        new_value: str, action: str = 'UPDATE',
        user_id: Optional[int] = None, user_name: Optional[str] = None,
    ):
        """Zapisz zmianę pola faktury (backward-compatible wrapper)"""
        self.log_event(
            entity_type='invoice',
            action=action,
            entity_id=invoice_id,
            entity_label=None,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            user_id=user_id,
            user_name=user_name,
            invoice_id=invoice_id,
        )

    def get_by_invoice_id(self, invoice_id: int) -> List[dict]:
        """Pobierz historię zmian faktury"""
        return self.get_all(invoice_id=invoice_id)

    def get_all(
        self,
        invoice_id: Optional[int] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[Union[int, str]] = None,
    ) -> List[dict]:
        """
        Pobierz historię zmian z opcjonalnym filtrowaniem.
        Zwraca listę pasującą do oczekiwań API/Frontend.
        """
        params = []
        conditions = []

        if invoice_id:
            conditions.append("a.invoice_id = %s")
            params.append(invoice_id)

        if entity_type:
            conditions.append("a.entity_type = %s")
            params.append(entity_type)

        # entity_id is only meaningful paired with entity_type — audit_log's
        # entity_id is TEXT and reused across entity types (a worker '1' and
        # an action_plan '1' are different rows), so this is the first
        # caller needing a *single instance's* history (action_plans' LUK_1
        # audit trail) rather than every row for a whole entity_type.
        if entity_id is not None:
            conditions.append("a.entity_id = %s")
            params.append(str(entity_id))

        where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        query = f"""
            SELECT
                a.id,
                a.entity_type,
                a.entity_id,
                a.entity_label,
                a.invoice_id,
                a.action,
                a.field_name,
                a.old_value,
                a.new_value,
                a.user_id,
                a.user_name,
                a.changed_at,
                i.invoice_number
            FROM audit_log a
            LEFT JOIN invoices i ON a.invoice_id = i.id
            {where_clause}
            ORDER BY a.changed_at DESC, a.id DESC
        """

        rows = self._fetch_all(query, tuple(params))

        results = []
        for row in rows:
            results.append({
                'id': row['id'],
                'entity_type': row['entity_type'] or 'invoice',
                'entity_id': row['entity_id'],
                'entity_label': row['entity_label'],
                'invoice_id': row['invoice_id'],
                'invoice_number': row['invoice_number'],
                'action': row['action'],
                'field_name': row['field_name'],
                'old_value': row['old_value'],
                'new_value': row['new_value'],
                'user_id': row['user_id'],
                'user_name': row['user_name'],
                'timestamp': row['changed_at'],
            })

        return results

    def get_details_by_ids(self, ids_list: List[int]) -> List[dict]:
        """Pobierz szczegóły zmian dla podanych ID"""
        if not ids_list:
            return []

        placeholders = ','.join(['%s'] * len(ids_list))
        query = f"""
            SELECT field_name, old_value, new_value
            FROM audit_log
            WHERE id IN ({placeholders})
        """
        rows = self._fetch_all(query, tuple(ids_list))
        return [dict(row) for row in rows]
