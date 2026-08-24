"""
Repository dla powiązania szkolenia ze stanowiskami (training_job, TRN_3).

Audytowane pod audit_entity_type='training' z entity_id=training_id, sama
forma delete-then-insert (replace_links) co JobSkillRepository.replace_requirements
(Faza 3). `is_mandatory`/`sequence_order` (migracja n3o4p5q6r7s8) to
per-relacyjne metadane, ten sam wzorzec co job_skills.required_rating — cechy
"roli tego szkolenia w programie danego stanowiska", nie samego szkolenia:
to samo szkolenie może być opcjonalne dla jednego stanowiska i
obowiązkowe+pierwsze dla innego.
"""
from typing import Any, List, Optional, Set

from exceptions import ConflictError
from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT tj.id, tj.training_id, tj.job_id, j.description AS job_description,
           tj.is_mandatory, tj.sequence_order
    FROM training_job tj
    JOIN jobs j ON j.id = tj.job_id
"""


class TrainingJobRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'

    def __init__(self):
        super().__init__('training_job')

    def get_by_training(self, training_id: int) -> List[Any]:
        return self._fetch_all(_SELECT + " WHERE tj.training_id = %s ORDER BY tj.sequence_order NULLS LAST, j.id", (training_id,))

    def training_ids_for_job(self, job_id: str) -> Set[int]:
        """Reverse of get_by_training — every training linked to one job
        position. Backs the "Szkolenia wstępne" flow's server-side
        membership check (services/worker_onboarding_service.py): a
        training can only be bulk-scheduled as onboarding if it's actually
        part of the worker's job's curriculum, even though the frontend
        already filters the picker the same way."""
        rows = self._fetch_all("SELECT training_id FROM training_job WHERE job_id = %s", (job_id,))
        return {r['training_id'] for r in rows}

    def _assert_sequence_available(self, job_id: str, sequence_order: Optional[int], *, exclude_training_id: int) -> None:
        """`sequence_order` is only meaningful (and only unique) within one
        job's curriculum — the same slot number on two *different* jobs
        doesn't collide, only two different trainings claiming the same
        slot for the SAME job does. `exclude_training_id` lets a training
        keep its own already-held slot when replace_links rewrites its
        whole link set (delete+reinsert would otherwise briefly self-collide
        with the row it's about to replace)."""
        if sequence_order is None:
            return
        row = self._fetch_one(
            "SELECT t.description FROM training_job tj JOIN trainings t ON t.id = tj.training_id "
            "WHERE tj.job_id = %s AND tj.sequence_order = %s AND tj.training_id != %s",
            (job_id, sequence_order, exclude_training_id),
        )
        if row:
            raise ConflictError(
                f'Stanowisko ma już szkolenie z kolejnością {sequence_order} w programie wstępnym ("{row["description"]}").'
            )

    def replace_links(self, training_id: int, jobs: List[dict]) -> None:
        """Replace the training's whole set of linked jobs in one call
        (TRN_3) — same delete-then-insert shape as
        JobSkillRepository.replace_requirements. `jobs` is a list of
        {job_id, is_mandatory, sequence_order}. Also how a single link gets
        added: TrainingJobsSection's "Dodaj stanowisko" sends the current
        set plus one more entry (same as JobSkillsSection), and
        WorkerOnboardingTrainingsPage's "Utwórz szkolenie" flow calls this
        with a single-item list right after creating the training — DELETE
        affects zero rows on a brand-new training_id, so it's just an insert
        in practice, no separate single-link method needed."""
        seen: dict = {}
        for job in jobs:
            job_id = (job.get('job_id') or '').strip()
            if not job_id or job_id in seen:
                continue
            seen[job_id] = {
                'is_mandatory': bool(job.get('is_mandatory', True)),
                'sequence_order': job.get('sequence_order'),
            }

        # Validated up front, before any row is touched — a collision here
        # must reject the whole replace, not leave training_job half-rewritten.
        for job_id, meta in seen.items():
            self._assert_sequence_available(job_id, meta['sequence_order'], exclude_training_id=training_id)

        self._execute("DELETE FROM training_job WHERE training_id = %s", (training_id,))
        for job_id, meta in seen.items():
            self._execute(
                "INSERT INTO training_job (training_id, job_id, is_mandatory, sequence_order) VALUES (%s, %s, %s, %s)",
                (training_id, job_id, meta['is_mandatory'], meta['sequence_order']),
            )
        self._audit(
            'UPDATE', training_id, field_name='training_job',
            new=', '.join(sorted(seen)) or '(brak)',
        )
