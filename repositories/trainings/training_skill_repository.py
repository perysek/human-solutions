"""
Repository dla powiązania szkolenia z umiejętnościami (training_skills, TRN_4).

Analogicznie do TrainingJobRepository — patrz jego docstring dla uzasadnienia
kształtu replace-the-whole-set.
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT tsk.id, tsk.training_id, tsk.skill_id, s.description AS skill_description
    FROM training_skills tsk
    JOIN skills s ON s.id = tsk.skill_id
"""


class TrainingSkillRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'

    def __init__(self):
        super().__init__('training_skills')

    def get_by_training(self, training_id: int) -> List[Any]:
        return self._fetch_all(_SELECT + " WHERE tsk.training_id = %s ORDER BY s.id", (training_id,))

    def replace_links(self, training_id: int, skill_ids: List[str]) -> None:
        """Replace the training's whole set of linked skills in one call (TRN_4)."""
        self._execute("DELETE FROM training_skills WHERE training_id = %s", (training_id,))
        seen = set()
        for skill_id in skill_ids:
            skill_id = (skill_id or '').strip()
            if not skill_id or skill_id in seen:
                continue
            seen.add(skill_id)
            self._execute(
                "INSERT INTO training_skills (training_id, skill_id) VALUES (%s, %s)",
                (training_id, skill_id),
            )
        self._audit(
            'UPDATE', training_id, field_name='training_skills',
            new=', '.join(sorted(seen)) or '(brak)',
        )
