"""
Repository dla powiązania szkolenia ze stanowiskami (training_job, TRN_3).

Audytowane pod audit_entity_type='training' z entity_id=training_id — sama
forma delete-then-insert (replace_links) co
JobSkillRepository.replace_requirements (Faza 3), różnica tylko w braku
dodatkowej kolumny (tu czyste powiązanie, bez "wymaganej oceny").
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT tj.id, tj.training_id, tj.job_id, j.description AS job_description
    FROM training_job tj
    JOIN jobs j ON j.id = tj.job_id
"""


class TrainingJobRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'

    def __init__(self):
        super().__init__('training_job')

    def get_by_training(self, training_id: int) -> List[Any]:
        return self._fetch_all(_SELECT + " WHERE tj.training_id = %s ORDER BY j.id", (training_id,))

    def replace_links(self, training_id: int, job_ids: List[str]) -> None:
        """Replace the training's whole set of linked jobs in one call
        (TRN_3) — same shape as JobSkillRepository.replace_requirements."""
        self._execute("DELETE FROM training_job WHERE training_id = %s", (training_id,))
        seen = set()
        for job_id in job_ids:
            job_id = (job_id or '').strip()
            if not job_id or job_id in seen:
                continue
            seen.add(job_id)
            self._execute(
                "INSERT INTO training_job (training_id, job_id) VALUES (%s, %s)",
                (training_id, job_id),
            )
        self._audit(
            'UPDATE', training_id, field_name='training_job',
            new=', '.join(sorted(seen)) or '(brak)',
        )
