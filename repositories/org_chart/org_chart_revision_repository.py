"""
Repository dla org_chart_revisions + org_chart_revision_changes.

Migracja d6d10b667838 usunęła trigger bump_org_chart_revision() — rewizje nie
są już zapisywane WYŁĄCZNIE przez DB, tylko jawnie przez create_revision()
poniżej, gdy użytkownik kliknie "Utwórz rewizję" w modalu na stronie wykresu
(NewRevisionModal.tsx). Repository NIE dziedziczy AuditableMixin mimo że
teraz pisze — org_chart_revisions/org_chart_revision_changes same w sobie SĄ
już logiem zmian (kto/kiedy/co), więc audytowanie ich osobnym audit_log
wierszem byłoby logiem loga.

"Co się zmieniło od ostatniej rewizji" (list_pending_changes) czyta wprost z
audit_log — DepartmentRepository/JobRepository's AuditableMixin._audit()
wywołania są teraz jedynym źródłem prawdy o zmianie struktury, dokładnie te
same pola co dawny trigger wykrywał (patrz migracji d6d10b667838 docstring).
org_chart_revision_changes to tabela łącząca: który wiersz audit_log trafił
do której rewizji — UNIQUE(audit_log_id) gwarantuje, że jedna zmiana nigdy
nie zostanie policzona w dwóch rewizjach.
"""
from typing import Any, List, Optional, Tuple

from config.database import managed_transaction
from repositories.base_repository import BaseRepository

# Whitelist odzwierciedlający DOKŁADNIE to, co wykrywał dawny trigger
# bump_org_chart_revision() (migracje 0811375b3298, cab974083e2c):
#   - departments: INSERT, DELETE, lub UPDATE parent_department_id (już
#     zawsze value-aware — DepartmentRepository.update() audytuje to pole
#     tylko gdy faktycznie się zmieniło)
#   - jobs: UPDATE is_managerial/is_director/department_id (value-aware,
#     patrz JobRepository.update()), lub DELETE stanowiska kierowniczego/
#     Dyrektora (field_name='org_chart_structural_delete', patrz
#     JobRepository.delete())
#   - jobs INSERT świadomie wykluczone — ta sama decyzja produktowa co w
#     0811375b3298 (świeże, nieoznaczone stanowisko nie zmienia kształtu)
_PENDING_CHANGES_WHERE = """
    WHERE (
        (a.entity_type = 'department' AND a.action IN ('CREATE', 'DELETE'))
        OR (a.entity_type = 'department' AND a.action = 'UPDATE' AND a.field_name = 'parent_department_id')
        OR (
            a.entity_type = 'job' AND a.action = 'UPDATE'
            AND a.field_name IN ('is_managerial', 'is_director', 'department_id')
        )
        OR (a.entity_type = 'job' AND a.action = 'DELETE' AND a.field_name = 'org_chart_structural_delete')
    )
    AND NOT EXISTS (
        SELECT 1 FROM org_chart_revision_changes c WHERE c.audit_log_id = a.id
    )
"""


def _pluralize_changes(count: int) -> str:
    """Polskie formy liczby mnogiej rzeczownika 'zmiana': 1 zmiana, 2-4
    zmiany (poza 12-14), 5+/0 zmian. Żyje tutaj (nie w services/) żeby
    summary dało się zbudować wewnątrz tej samej transakcji co ostateczne
    policzenie pending — inaczej summary mógłby się rozjechać z tym, ile
    wierszy faktycznie trafiło do org_chart_revision_changes na wyścigu
    dwóch równoległych requestów."""
    if count == 1:
        word = 'zmiana'
    elif count % 10 in (2, 3, 4) and not (12 <= count % 100 <= 14):
        word = 'zmiany'
    else:
        word = 'zmian'
    return f'Ręczna rewizja — {count} {word}'


class OrgChartRevisionRepository(BaseRepository):
    def __init__(self):
        super().__init__('org_chart_revisions')

    def get_latest(self) -> Optional[Any]:
        """Najnowsza rewizja — zasila mały badge 'Rev. 8 · 31.08.2026, 19:17'
        na stronie wykresu organizacyjnego."""
        return self._fetch_one(
            "SELECT id, revised_at, summary, created_by_user_name FROM org_chart_revisions ORDER BY id DESC LIMIT 1",
        )

    def get_latest_audit_id(self) -> Optional[int]:
        """Sam numer najnowszego wiersza audit_log, bez pobierania jego
        treści — tani sposób na przechwycenie stanu 'przed'/'po' w obrębie
        jednego requestu (routes/departments, routes/jobs porównują to przed
        i po każdej mutacji, żeby wiedzieć, czy pokazać toast o nowej
        oczekującej zmianie, bez duplikowania w Pythonie logiki decydującej
        co się liczy jako zmiana struktury — MAX(id) jest tanie i
        append-only, więc rosnące id samo w sobie jest dowodem nowego
        wiersza). Odpowiednik dawnego get_latest_id(), teraz wycelowany w
        audit_log zamiast w org_chart_revisions, bo to audit_log jest teraz
        źródłem prawdy o zmianie — patrz list_pending_changes."""
        row = self._fetch_one("SELECT MAX(id) AS max_id FROM audit_log")
        return row['max_id'] if row else None

    def list_pending_changes(self) -> List[Any]:
        """Wiersze audit_log odpowiadające zmianom struktury, które nie
        trafiły jeszcze do żadnej rewizji — to lista, którą pokazuje
        NewRevisionModal, i to ona jest wprost przekładana na
        org_chart_revision_changes przez create_revision()."""
        return self._fetch_all(
            f"""
            SELECT a.id, a.entity_type, a.entity_id, a.entity_label, a.action,
                   a.field_name, a.old_value, a.new_value, a.user_id, a.user_name, a.changed_at
            FROM audit_log a
            {_PENDING_CHANGES_WHERE}
            ORDER BY a.changed_at, a.id
            """,
        )

    def create_revision(self, user_id: Optional[int], user_name: Optional[str]) -> Optional[int]:
        """Tworzy nową rewizję ze WSZYSTKICH aktualnie oczekujących zmian.
        Zwraca None, jeśli nic nie jest oczekujące (wywołujący — patrz
        services/org_chart_service.py's create_revision — tłumaczy to na
        ValidationError zamiast tworzyć pustą rewizję).

        list_pending_changes() jest wywoływane PONOWNIE wewnątrz
        managed_transaction — nie na podstawie tego, co modal pokazywał
        użytkownikowi chwilę wcześniej — żeby zamknąć okno wyścigu: gdyby
        ktoś zapisał kolejną strukturalną zmianę między otwarciem modala a
        kliknięciem 'Utwórz rewizję', ta zmiana i tak trafia do tej samej
        rewizji (poprawnie — wciąż jest 'oczekująca'), zamiast zostać
        pominięta albo policzona podwójnie w wyścigu z drugim requestem.
        """
        with managed_transaction():
            pending = self.list_pending_changes()
            if not pending:
                return None
            summary = _pluralize_changes(len(pending))
            revision_id = self._execute_insert(
                "INSERT INTO org_chart_revisions (created_by_user_id, created_by_user_name, summary) "
                "VALUES (%s, %s, %s)",
                (user_id, user_name, summary),
            )
            for row in pending:
                self._execute(
                    "INSERT INTO org_chart_revision_changes (revision_id, audit_log_id) VALUES (%s, %s)",
                    (revision_id, row['id']),
                )
            return revision_id

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
            "SELECT id, revised_at, summary, created_by_user_name FROM org_chart_revisions "
            "ORDER BY id DESC LIMIT %s OFFSET %s",
            (page_size, offset),
        )
        return rows, total
