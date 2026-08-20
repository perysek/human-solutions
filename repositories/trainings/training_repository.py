"""
Repository dla szkoleń wewnętrznych (trainings) — IMPLEMENTATION_PLAN.md §10.

Klucz surogatowy (SERIAL), inaczej niż jobs/skills/workers (cross-cutting
decision #1 dotyczy tylko słowników z sensownym kluczem naturalnym) — nie ma
naturalnego "kodu" szkolenia, więc `id` jest zwykłym auto-increment.
"""
from typing import Any, List, Optional, Tuple

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_COLUMNS = 'id, description, remarks, training_date, completion, related_docs, training_details, created_at, updated_at'

# Whitelisted sort columns — same pattern as WorkerRepository._SORT_COLUMNS,
# never interpolate a raw client-supplied column name into SQL.
_SORT_COLUMNS = {
    'description': 'description',
    'training_date': 'training_date',
    'completion': 'completion',
}
_DEFAULT_SORT = 'training_date'


class TrainingRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'
    _columns = _COLUMNS

    def __init__(self):
        super().__init__('trainings')

    def get_all(
        self, *, search: Optional[str] = None, sort: Optional[str] = None,
        order: str = 'asc', page: int = 1, page_size: int = 25,
    ) -> Tuple[List[Any], int]:
        """Paginated, filtered, sorted training catalog (TRN_1). Search
        matches the training's own description OR (via EXISTS, so a
        multi-skill training doesn't duplicate rows the way a plain JOIN
        would) any linked skill's description — PRD's "nazwa, data,
        powiązana umiejętność" search scope."""
        conditions = []
        params: list = []

        if search:
            like = f'%{search}%'
            conditions.append(
                "(description ILIKE %s OR EXISTS ("
                "SELECT 1 FROM training_skills tsk JOIN skills sk ON sk.id = tsk.skill_id "
                "WHERE tsk.training_id = trainings.id AND sk.description ILIKE %s))"
            )
            params.extend([like, like])

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ''

        sort_column = _SORT_COLUMNS.get(sort or _DEFAULT_SORT, _SORT_COLUMNS[_DEFAULT_SORT])
        order_sql = 'DESC' if str(order).lower() == 'desc' else 'ASC'

        count_query = f"SELECT COUNT(*) AS total FROM trainings{where_clause}"
        total = self._fetch_one(count_query, tuple(params))['total']

        offset = max(page - 1, 0) * page_size
        list_query = (
            f"SELECT {_COLUMNS} FROM trainings{where_clause} "
            f"ORDER BY {sort_column} {order_sql} NULLS LAST, id ASC LIMIT %s OFFSET %s"
        )
        rows = self._fetch_all(list_query, tuple(params) + (page_size, offset))

        return rows, total

    def create(
        self, description: str, remarks: Optional[str], training_date, completion: Optional[int],
        related_docs: Optional[str], training_details: Optional[str],
    ) -> int:
        new_id = self._execute_insert(
            "INSERT INTO trainings (description, remarks, training_date, completion, related_docs, training_details) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (description, remarks, training_date, completion, related_docs, training_details),
        )
        self._audit('CREATE', new_id, label=description)
        return new_id

    def update(
        self, training_id: int, description: str, remarks: Optional[str], training_date, completion: Optional[int],
        related_docs: Optional[str], training_details: Optional[str],
    ) -> None:
        self._execute(
            "UPDATE trainings SET description = %s, remarks = %s, training_date = %s, completion = %s, "
            "related_docs = %s, training_details = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (description, remarks, training_date, completion, related_docs, training_details, training_id),
        )
        self._audit('UPDATE', training_id, label=description)

    def delete(self, training_id: int) -> bool:
        existing = self.get_by_id(training_id)
        cursor = self._execute("DELETE FROM trainings WHERE id = %s", (training_id,))
        deleted = cursor.rowcount > 0
        if deleted and existing:
            self._audit('DELETE', training_id, label=existing['description'])
        return deleted

    def count_current_month(self) -> int:
        """DSH_1 — liczba szkoleń, których `training_date` przypada na
        bieżący miesiąc kalendarzowy, dla podsumowania na pulpicie."""
        row = self._fetch_one(
            "SELECT COUNT(*) AS total FROM trainings "
            "WHERE date_trunc('month', training_date) = date_trunc('month', CURRENT_DATE)"
        )
        return row['total']

    def is_trainer_of(self, training_id: int, worker_id: str) -> bool:
        """TRN_7's ownership check: does ``worker_id`` appear as the trainer
        on any participant row of this training? A training can have several
        participants trained by different people (co-taught / multi-session
        courses), so "the trainer of this training" is "figures as trainer
        on at least one enrollment", not a single trainer_id column on
        `trainings` itself."""
        row = self._fetch_one(
            "SELECT 1 FROM training_participants WHERE training_id = %s AND trainer_id = %s LIMIT 1",
            (training_id, worker_id),
        )
        return row is not None

    def list_for_trainer(self, trainer_worker_id: str) -> List[Any]:
        """Trainings where ``trainer_worker_id`` runs at least one
        enrollment — the query Faza 6's dashboard "moje szkolenia" panel
        will consume (own_data=TRUE row for `trainer`/`dashboard`, PRD §11).
        No Faza 5 route calls this yet; built now per IMPLEMENTATION_PLAN.md
        §10's explicit method list rather than left for Faza 6 to add
        alongside its own repository changes."""
        query = f"""
            SELECT DISTINCT {', '.join(f't.{c}' for c in _COLUMNS.split(', '))}
            FROM trainings t
            JOIN training_participants tp ON tp.training_id = t.id
            WHERE tp.trainer_id = %s
            ORDER BY t.training_date DESC NULLS LAST, t.id
        """
        return self._fetch_all(query, (trainer_worker_id,))
