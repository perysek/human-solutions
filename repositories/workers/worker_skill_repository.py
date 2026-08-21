"""
Repository dla ocen umiejętności pracownika (worker_skills, SKL_2).

Audytowane pod audit_entity_type='worker' z entity_id=worker_id. Każda
zmiana oceny zapisana z field_name='current_rating', old=..., new=... —
to *jest* SKL_5 (historia zmian oceny przez audit trail), bez dodatkowego
mechanizmu: audit_log już przechowuje starą/nową wartość pola.
"""
from datetime import date
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT ws.id, ws.worker_id, ws.skill_id, s.description AS skill_description,
           ws.current_rating, ws.last_update, ws.created_at, ws.updated_at
    FROM worker_skills ws
    JOIN skills s ON s.id = ws.skill_id
"""


class WorkerSkillRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('worker_skills')

    def get_by_worker(self, worker_id: str) -> List[Any]:
        return self._fetch_all(_SELECT + " WHERE ws.worker_id = %s ORDER BY s.id", (worker_id,))

    def get_one(self, worker_id: str, skill_id: str) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE ws.worker_id = %s AND ws.skill_id = %s", (worker_id, skill_id))
        return rows[0] if rows else None

    def get_by_id(self, worker_skill_id: int) -> Optional[Any]:
        rows = self._fetch_all(_SELECT + " WHERE ws.id = %s", (worker_skill_id,))
        return rows[0] if rows else None

    def set_rating(
        self, worker_id: str, skill_id: str, current_rating: Optional[int],
        last_update: Optional[date] = None,
    ) -> int:
        """Create or update the one rating row for (worker_id, skill_id).
        Audits the field-level old/new rating (SKL_5) — the whole point of
        this method existing separately from a generic upsert helper."""
        existing = self.get_one(worker_id, skill_id)
        old_rating = existing['current_rating'] if existing else None

        query = """
            INSERT INTO worker_skills (worker_id, skill_id, current_rating, last_update)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (worker_id, skill_id) DO UPDATE
                SET current_rating = EXCLUDED.current_rating,
                    last_update = EXCLUDED.last_update,
                    updated_at = CURRENT_TIMESTAMP
        """
        # _execute_insert appends ' RETURNING id' to whatever query it's
        # given — valid here too, since RETURNING can follow an ON CONFLICT
        # DO UPDATE clause just as well as a plain INSERT.
        new_id = self._execute_insert(query, (worker_id, skill_id, current_rating, last_update))

        self._audit(
            'UPDATE', worker_id, label=skill_id,
            field_name='current_rating', old=old_rating, new=current_rating,
        )
        return new_id

    def remove_rating(self, worker_id: str, skill_id: str) -> bool:
        cursor = self._execute(
            "DELETE FROM worker_skills WHERE worker_id = %s AND skill_id = %s",
            (worker_id, skill_id),
        )
        deleted = cursor.rowcount > 0
        if deleted:
            self._audit('DELETE', worker_id, label=skill_id, field_name='current_rating')
        return deleted

    def filter_by_gap(self, skill_id: Optional[str] = None, min_gap: int = 1) -> List[Any]:
        """SKL_6 — active workers whose competency gap (required_rating -
        current_rating, unassessed treated as 0) is >= min_gap, optionally
        for one specific skill. One query across workers/job_skills/
        worker_skills rather than looping get_gap_analysis per worker —
        this has to scan every worker's requirements at once, not one
        worker's.

        Ordered by worker first (surname, firstname), then by gap size —
        the "Luki kompetencyjne" report (LUK_1) groups every gap row under
        its worker, so rows for the same worker must come back contiguous;
        gap DESC as the primary sort (as SKL_6 alone once had it) would
        interleave workers instead."""
        conditions = ['w.fire_date IS NULL', '(js.required_rating - COALESCE(ws.current_rating, 0)) >= %s']
        params: list = [min_gap]
        if skill_id:
            conditions.append('js.skill_id = %s')
            params.append(skill_id)
        where = ' AND '.join(conditions)
        query = f"""
            SELECT w.id AS worker_id, w.firstname, w.surname,
                   j.description AS job_description,
                   b.firstname AS boss_firstname, b.surname AS boss_surname,
                   js.skill_id, s.description AS skill_description,
                   js.required_rating, ws.current_rating, ws.last_update,
                   (js.required_rating - COALESCE(ws.current_rating, 0)) AS gap
            FROM workers w
            JOIN job_skills js ON js.job_id = w.job_id
            JOIN skills s ON s.id = js.skill_id
            LEFT JOIN worker_skills ws ON ws.worker_id = w.id AND ws.skill_id = js.skill_id
            LEFT JOIN jobs j ON j.id = w.job_id
            LEFT JOIN workers b ON b.id = w.boss_id
            WHERE {where}
            ORDER BY w.surname, w.firstname, gap DESC, s.description
        """
        return self._fetch_all(query, tuple(params))
