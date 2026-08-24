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
        order: str = 'asc', page: int = 1, page_size: int = 25, skill_id: Optional[str] = None,
        job_id: Optional[str] = None, worker_id: Optional[str] = None,
    ) -> Tuple[List[Any], int]:
        """Paginated, filtered, sorted training catalog (TRN_1). Search
        matches the training's own description OR (via EXISTS, so a
        multi-skill training doesn't duplicate rows the way a plain JOIN
        would) any linked skill's description — PRD's "nazwa, data,
        powiązana umiejętność" search scope.

        `skill_id` is a separate, stricter filter (exact link, not text
        search) — the "Szkolenie" picker in ActionPlanModal uses it to show
        only trainings already linked to the gap's skill (training_skills),
        so raising a training-linked action plan can't point at a training
        that has nothing to do with the skill it's meant to close.

        `job_id` is the same idea over `training_job` — the "Szkolenia
        wstępne" picker (WorkerOnboardingTrainingsPage) narrows the catalog
        to trainings linked to one worker's job position.

        `worker_id`, paired with `job_id`, adds one computed column
        (`worker_status`, NULL unless passed) rather than filtering — the
        picker needs to know, per row, whether this worker already has an
        active enrollment (to disable that row's checkbox), not to have
        already-enrolled trainings dropped from the list.

        `job_id` also adds `job_is_mandatory`/`job_sequence_order` — that
        specific (training, job) link's own training_job metadata (migration
        n3o4p5q6r7s8), so the "Szkolenia wstępne" picker can show/sort by
        them. Both NULL when `job_id` isn't passed (nothing to scope them
        to — a training has no single "the" job)."""
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

        if skill_id:
            conditions.append(
                "EXISTS (SELECT 1 FROM training_skills tsk2 "
                "WHERE tsk2.training_id = trainings.id AND tsk2.skill_id = %s)"
            )
            params.append(skill_id)

        if job_id:
            conditions.append(
                "EXISTS (SELECT 1 FROM training_job tj3 WHERE tj3.training_id = trainings.id AND tj3.job_id = %s)"
            )
            params.append(job_id)

        where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ''

        sort_column = _SORT_COLUMNS.get(sort or _DEFAULT_SORT, _SORT_COLUMNS[_DEFAULT_SORT])
        order_sql = 'DESC' if str(order).lower() == 'desc' else 'ASC'

        count_query = f"SELECT COUNT(*) AS total FROM trainings{where_clause}"
        total = self._fetch_one(count_query, tuple(params))['total']

        # Three computed columns for the catalog table only (not part of
        # _COLUMNS/get_by_id — a training's own record has no "participant
        # count", these are derived from its roster): `participant_count`
        # (Task 1's "Uczestników" column), and `trainer_names`/`trainer_ids`
        # (Task 3's "Prowadzący" column — both variants returned so the route
        # layer can redact to ids for `viewer`, same RODO_3/OQ_3 rule as
        # TrainingParticipantRepository's participant/trainer names). A
        # training can have several trainers (training_trainers, migration
        # b8c9d0e1f2a3), hence STRING_AGG rather than a single join.
        # `last_session_date` (Task 3) is the roster's latest finish_date —
        # NULL until at least one participant has actually finished.
        # worker_status — only spliced in when worker_id is given, since its
        # placeholder sits inside the SELECT list (before where_clause's own
        # params in the final SQL text) and must be bound in that same
        # left-to-right position. Same 3-value CASE as
        # TrainingParticipantRepository._OPEN_REPORT_SELECT's `status`, minus
        # the "completed" distinction being reachable here too — an
        # already-fully-done onboarding training still counts as "already
        # enrolled" for the picker's duplicate-guard.
        worker_status_col = ''
        worker_status_params: tuple = ()
        if worker_id:
            worker_status_col = (
                ", (SELECT CASE "
                "WHEN tp2.finish_date IS NOT NULL AND tp2.effectiveness_date IS NOT NULL THEN 'completed' "
                "WHEN tp2.finish_date IS NOT NULL THEN 'in_progress' ELSE 'defined' END "
                "FROM training_participants tp2 WHERE tp2.training_id = trainings.id AND tp2.worker_id = %s "
                "AND NOT tp2.is_deleted ORDER BY tp2.id DESC LIMIT 1) AS worker_status"
            )
            worker_status_params = (worker_id,)

        job_link_col = ''
        job_link_params: tuple = ()
        if job_id:
            job_link_col = (
                ", (SELECT tj4.is_mandatory FROM training_job tj4 "
                "WHERE tj4.training_id = trainings.id AND tj4.job_id = %s) AS job_is_mandatory, "
                "(SELECT tj4.sequence_order FROM training_job tj4 "
                "WHERE tj4.training_id = trainings.id AND tj4.job_id = %s) AS job_sequence_order"
            )
            job_link_params = (job_id, job_id)

        offset = max(page - 1, 0) * page_size
        list_query = (
            f"SELECT {_COLUMNS}, "
            "(SELECT COUNT(*) FROM training_participants tp "
            "WHERE tp.training_id = trainings.id AND NOT tp.is_deleted) AS participant_count, "
            "(SELECT STRING_AGG(w.firstname || ' ' || w.surname, ', ' ORDER BY w.surname, w.firstname) "
            " FROM training_trainers tt JOIN workers w ON w.id = tt.trainer_id "
            "WHERE tt.training_id = trainings.id) AS trainer_names, "
            "(SELECT STRING_AGG(tt.trainer_id, ', ' ORDER BY tt.trainer_id) FROM training_trainers tt "
            "WHERE tt.training_id = trainings.id) AS trainer_ids, "
            "(SELECT MAX(tp.finish_date) FROM training_participants tp "
            "WHERE tp.training_id = trainings.id AND NOT tp.is_deleted) AS last_session_date"
            f"{worker_status_col}{job_link_col} "
            f"FROM trainings{where_clause} "
            f"ORDER BY {sort_column} {order_sql} NULLS LAST, id ASC LIMIT %s OFFSET %s"
        )
        rows = self._fetch_all(list_query, worker_status_params + job_link_params + tuple(params) + (page_size, offset))

        return rows, total

    def create(
        self, description: str, remarks: Optional[str], training_date,
        related_docs: Optional[str], training_details: Optional[str],
    ) -> int:
        """`completion` isn't a create() parameter — it's never user-supplied
        (see recalculate_completion): a brand-new training has no
        participants yet, so it starts NULL ('—' in the UI) rather than any
        caller-chosen value."""
        new_id = self._execute_insert(
            "INSERT INTO trainings (description, remarks, training_date, related_docs, training_details) "
            "VALUES (%s, %s, %s, %s, %s)",
            (description, remarks, training_date, related_docs, training_details),
        )
        self._audit('CREATE', new_id, label=description)
        return new_id

    def update(
        self, training_id: int, description: str, remarks: Optional[str], training_date,
        related_docs: Optional[str], training_details: Optional[str],
    ) -> None:
        """Deliberately doesn't touch `completion` — see recalculate_completion."""
        self._execute(
            "UPDATE trainings SET description = %s, remarks = %s, training_date = %s, "
            "related_docs = %s, training_details = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (description, remarks, training_date, related_docs, training_details, training_id),
        )
        self._audit('UPDATE', training_id, label=description)

    def recalculate_completion(self, training_id: int) -> None:
        """Auto-derives `completion` from the roster: percentage of this
        training's participants who are BOTH done (finish_date set) AND
        confirmed effective (effectiveness_date set) — "ukończone i
        skuteczne" is the bar, not just attendance. Called after every
        participant create/update (services/training_service.py) so the
        field never drifts from the roster it's computed from; NULL (not 0)
        with zero participants, since "0%" would misleadingly read as "ran
        and failed everyone" rather than "nobody enrolled yet".

        No self._audit() call — this is a high-frequency, derived value
        recomputed on every roster edit, exactly the kind of write
        AuditableMixin's docstring says to skip (the participant-level
        create/update that triggered it is already audited under the
        'training' entity)."""
        self._execute(
            """
            UPDATE trainings SET completion = (
                SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                            ELSE ROUND(100.0 * COUNT(*) FILTER (
                                WHERE finish_date IS NOT NULL AND effectiveness_date IS NOT NULL
                            ) / COUNT(*))
                       END
                FROM training_participants WHERE training_id = %s AND NOT is_deleted
            ), updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (training_id, training_id),
        )

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

    def get_overdue(self) -> List[Any]:
        """Pulpit's "Zaległe szkolenia" alert (Faza 7) — trainings whose
        `training_date` has passed without the roster clearing
        recalculate_completion's own "done" bar (finish_date AND
        effectiveness_date both set on every non-deleted participant).
        `pending_participants` counts the roster still short of that bar, so
        the caller can show "N do przeszkolenia" without a second query; a
        training with no participants at all still qualifies (0 pending) —
        a planned session that never got a roster is exactly the kind of gap
        this alert exists to surface. `completion` (DISTINCT FROM 100) is
        the cheap short-circuit — pending_participants is the authoritative
        count, but skipping the LEFT JOIN's GROUP BY work for training's
        that are plainly done first keeps this query trivial even as the
        catalog grows."""
        return self._fetch_all(
            """
            SELECT t.id, t.description, t.training_date,
                   COUNT(tp.id) FILTER (
                       WHERE NOT tp.is_deleted
                       AND NOT (tp.finish_date IS NOT NULL AND tp.effectiveness_date IS NOT NULL)
                   ) AS pending_participants
            FROM trainings t
            LEFT JOIN training_participants tp ON tp.training_id = t.id
            WHERE t.training_date < CURRENT_DATE
              AND (t.completion IS NULL OR t.completion < 100)
            GROUP BY t.id, t.description, t.training_date
            ORDER BY t.training_date ASC
            """
        )

    def is_trainer_of(self, training_id: int, worker_id: str) -> bool:
        """TRN_7's ownership check: does ``worker_id`` appear as one of this
        training's assigned trainers (`training_trainers`, migration
        b8c9d0e1f2a3)? A training can have several trainers (co-taught /
        multi-session courses), so "the trainer of this training" is
        "figures in its trainer set", not a single trainer_id column on
        `trainings` itself."""
        row = self._fetch_one(
            "SELECT 1 FROM training_trainers WHERE training_id = %s AND trainer_id = %s LIMIT 1",
            (training_id, worker_id),
        )
        return row is not None

    def list_for_trainer(self, trainer_worker_id: str) -> List[Any]:
        """Trainings ``trainer_worker_id`` is assigned to run — the query
        Faza 6's dashboard "moje szkolenia" panel will consume (own_data=TRUE
        row for `trainer`/`dashboard`, PRD §11). No Faza 5 route calls this
        yet; built now per IMPLEMENTATION_PLAN.md §10's explicit method list
        rather than left for Faza 6 to add alongside its own repository
        changes."""
        query = f"""
            SELECT DISTINCT {', '.join(f't.{c}' for c in _COLUMNS.split(', '))}
            FROM trainings t
            JOIN training_trainers tt ON tt.training_id = t.id
            WHERE tt.trainer_id = %s
            ORDER BY t.training_date DESC NULLS LAST, t.id
        """
        return self._fetch_all(query, (trainer_worker_id,))
