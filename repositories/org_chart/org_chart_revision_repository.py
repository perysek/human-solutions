"""
Repository dla org_chart_revisions — ORG_CHART_PROPOSAL.md §3c.

Read-only: ta tabela jest zapisywana WYŁĄCZNIE przez trigger
bump_org_chart_revision() (migracja 0811375b3298), nigdy przez kod
aplikacji — patrz tej migracji docstring, dlaczego trigger, nie
repository-side `_audit()`. Repository nie dziedziczy AuditableMixin (nie
ma żadnej metody mutującej do zaudytowania) ani nie ustawia `_columns`
(SELECT jest jawny w każdej metodzie, bo `id`/`revised_at`/`trigger_source`
to cała tabela).
"""
from typing import Any, List, Optional, Tuple

from repositories.base_repository import BaseRepository


class OrgChartRevisionRepository(BaseRepository):
    def __init__(self):
        super().__init__('org_chart_revisions')

    def get_latest(self) -> Optional[Any]:
        """Najnowsza rewizja — zasila mały badge 'Rev. 8 · 31.08.2026, 19:17'
        na stronie wykresu organizacyjnego oraz treść toastu po zmianie
        struktury (ORG_CHART_PROPOSAL.md §4e, TASK3)."""
        return self._fetch_one(
            "SELECT id, revised_at, trigger_source FROM org_chart_revisions ORDER BY id DESC LIMIT 1",
        )

    def get_latest_id(self) -> Optional[int]:
        """Sam numer najnowszej rewizji, bez pobierania trigger_source —
        tani sposób na przechwycenie stanu 'przed'/'po' w obrębie jednego
        requestu (TASK3: routes/departments, routes/jobs porównują to przed
        i po każdej mutacji, żeby wiedzieć, czy pokazać toast, bez
        duplikowania w Pythonie logiki triggera decydującej co się liczy
        jako zmiana struktury — MAX(id) jest tanie i append-only, więc
        rosnące id samo w sobie jest dowodem nowego wiersza)."""
        row = self._fetch_one("SELECT MAX(id) AS max_id FROM org_chart_revisions")
        return row['max_id'] if row else None

    def list_paginated(
        self, page: int = 1, page_size: int = 25,
    ) -> Tuple[List[Any], int]:
        """Najnowsze najpierw (id DESC) — historia zmian czyta się od
        ostatniej. Ten sam kontrakt page/page_size/(rows, total) co
        TrainingRepository.get_all, zasilający PaginatedTable's serverSide
        mode (frontend/src/pages/org-chart/OrgChartPage.tsx)."""
        total_row = self._fetch_one("SELECT COUNT(*) AS total FROM org_chart_revisions")
        total = total_row['total'] if total_row else 0

        offset = max(page - 1, 0) * page_size
        rows = self._fetch_all(
            "SELECT id, revised_at, trigger_source FROM org_chart_revisions "
            "ORDER BY id DESC LIMIT %s OFFSET %s",
            (page_size, offset),
        )
        return rows, total
