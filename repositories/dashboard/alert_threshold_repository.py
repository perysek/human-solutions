"""
Repository dla progów alertów (alert_thresholds, DSH_5).

Jeden wiersz na moduł (`medical`/`bhp`/`foreigner_docs`), zaseedowany przez
migrację create_alert_thresholds_table z domyślnymi 30/60/90 (kolumnowe
DEFAULT, patrz jej docstring). Edytowalne wyłącznie przez superadmina
(routes/dashboard/routes.py). services/alert_service.py czyta stąd progi
bucketingu, z fallbackiem na twarde stałe, gdyby wiersz/baza były
niedostępne — patrz jego `_get_thresholds`.
"""
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = "SELECT module, warning_days, critical_days, notice_days, updated_at, updated_by FROM alert_thresholds"


class AlertThresholdRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'alert_threshold'

    def __init__(self):
        super().__init__('alert_thresholds')

    def get_all(self) -> List[Any]:
        return self._fetch_all(_SELECT + " ORDER BY module")

    def get_by_module(self, module: str) -> Optional[Any]:
        return self._fetch_one(_SELECT + " WHERE module = %s", (module,))

    def update(self, module: str, *, warning_days: int, critical_days: int, notice_days: int, updated_by: int) -> bool:
        existing = self.get_by_module(module)
        if not existing:
            return False
        self._execute(
            "UPDATE alert_thresholds SET warning_days = %s, critical_days = %s, notice_days = %s, "
            "updated_at = CURRENT_TIMESTAMP, updated_by = %s WHERE module = %s",
            (warning_days, critical_days, notice_days, updated_by, module),
        )
        self._audit(
            'UPDATE', module, label=module, field_name='alert_thresholds',
            old=f"{existing['critical_days']}/{existing['warning_days']}/{existing['notice_days']}",
            new=f"{critical_days}/{warning_days}/{notice_days}",
        )
        return True
