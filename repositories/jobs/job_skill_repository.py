"""
Repository dla wymaganych umiejętności stanowiska (job_skills, JOB_2/JOB_4).

Audytowane pod audit_entity_type='job' z entity_id=job_id (nie
'job_skills') — zmiana wymagań kompetencyjnych stanowiska pojawia się w
śladzie audytowym *stanowiska*, tak samo jak worker_skills audytowane są
pod encją pracownika (IMPLEMENTATION_PLAN.md §8).
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT js.id, js.job_id, js.skill_id, s.description AS skill_description,
           js.required_rating, js.created_at, js.updated_at
    FROM job_skills js
    JOIN skills s ON s.id = js.skill_id
"""


class JobSkillRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'job'

    def __init__(self):
        super().__init__('job_skills')

    def get_by_job(self, job_id: str) -> List[Any]:
        return self._fetch_all(_SELECT + " WHERE js.job_id = %s ORDER BY s.id", (job_id,))

    def replace_requirements(self, job_id: str, requirements: List[dict]) -> None:
        """Replace the job's whole required-skills set in one call (JOB_4) —
        same delete-then-insert shape as WorkerNationalityRepository.replace_all,
        which fits a form that edits the list as a whole rather than
        per-row CRUD. `requirements` is a list of {skill_id, required_rating}.
        """
        self._execute("DELETE FROM job_skills WHERE job_id = %s", (job_id,))
        seen = set()
        for req in requirements:
            skill_id = (req.get('skill_id') or '').strip()
            rating = req.get('required_rating')
            if not skill_id or skill_id in seen or rating is None:
                continue
            seen.add(skill_id)
            self._execute(
                "INSERT INTO job_skills (job_id, skill_id, required_rating) VALUES (%s, %s, %s)",
                (job_id, skill_id, rating),
            )
        self._audit(
            'UPDATE', job_id, field_name='job_skills',
            new=', '.join(f'{s}' for s in sorted(seen)) or '(brak)',
        )
