"""
Repository dla worker_onboarding_status — "employee & job-position combined
index" table (migracja m2n3o4p5q6r7) za flow'em "Szkolenia wstępne"
(WorkerOnboardingTrainingsPage). Jeden wiersz na (worker_id, job_id) —
`completed`/`completion_pct` to cache, przeliczany za każdym razem, gdy
zmienia się pracownika roster szkoleń oznaczonych `is_onboarding = TRUE`
(services/worker_onboarding_service.py), tym samym wzorcem co
TrainingRepository.recalculate_completion.

Brak wiersza = "Nie zaplanowane" (nigdy nie uruchomiono bulk-schedule dla
tej pary pracownik/stanowisko) — recalculate() usuwa wiersz, gdy licznik
onboardingowych uczestnictw spadnie do zera, żeby nie zostawiać martwego
0%-owego rekordu.
"""
from typing import Any, Optional

from repositories.base_repository import BaseRepository


class WorkerOnboardingRepository(BaseRepository):
    def __init__(self):
        super().__init__('worker_onboarding_status')

    def get_status(self, worker_id: str, job_id: str) -> Optional[Any]:
        return self._fetch_one(
            "SELECT id, worker_id, job_id, completed, completion_pct, created_at, updated_at "
            "FROM worker_onboarding_status WHERE worker_id = %s AND job_id = %s",
            (worker_id, job_id),
        )

    def recalculate(self, worker_id: str, job_id: str) -> None:
        """Recompute from the worker's current onboarding-flagged roster
        (non-deleted `training_participants` rows with `is_onboarding =
        TRUE`) — "done" is the exact same bar
        TrainingRepository.recalculate_completion uses (finish_date AND
        effectiveness_date both set). `completed` only flips TRUE once
        every onboarding enrollment clears that bar; with zero onboarding
        enrollments left (e.g. all soft-deleted) the row is dropped instead
        of kept at a stale 0%, so the employee list badge falls back to
        "Nie zaplanowane" on its own."""
        row = self._fetch_one(
            """
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE finish_date IS NOT NULL AND effectiveness_date IS NOT NULL) AS done
            FROM training_participants
            WHERE worker_id = %s AND is_onboarding = TRUE AND NOT is_deleted
            """,
            (worker_id,),
        )
        total, done = row['total'], row['done']

        if total == 0:
            self._execute(
                "DELETE FROM worker_onboarding_status WHERE worker_id = %s AND job_id = %s",
                (worker_id, job_id),
            )
            return

        completed = done == total
        completion_pct = round(100.0 * done / total)
        self._execute(
            """
            INSERT INTO worker_onboarding_status (worker_id, job_id, completed, completion_pct)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (worker_id, job_id) DO UPDATE
                SET completed = EXCLUDED.completed,
                    completion_pct = EXCLUDED.completion_pct,
                    updated_at = CURRENT_TIMESTAMP
            """,
            (worker_id, job_id, completed, completion_pct),
        )
