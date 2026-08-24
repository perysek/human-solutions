"""Dedupe + partial unique index on training_participants (training_id, worker_id)

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-24

Nothing ever stopped the same worker being registered twice for the same
training — `register_participant` only checked that the worker existed, not
that they weren't already enrolled (auto-enroll-from-job-link, TrainingJobsSection,
does its own re-fetch-then-filter check client-side, but that's a
time-of-check/time-of-use race, not a guarantee — and the plain "Dodaj
uczestnika" form had no check at all). The dev DB already had 3 such pairs
by the time this migration was written.

Same shape as g1h2i3j4k5l6 (invoices.invoice_number): a partial unique index
scoped to non-deleted rows, so a soft-deleted enrollment doesn't block
re-adding the same worker later (Task 5's re-enroll case, see
f6a7b8c9d0e1's docstring).

Existing duplicates are resolved first (the index creation would otherwise
fail) by keeping the most-advanced row per (training_id, worker_id) —
ranked by effectiveness_date set > finish_date set > remarks/trainer_id set
> lowest id — and soft-deleting the rest, then `trainings.completion` is
recalculated for every training since the roster it's derived from may have
shrunk. This is a one-time data-integrity cleanup with no acting user, so
unlike a repository-driven delete it does not write an audit_log row.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY training_id, worker_id
                       ORDER BY
                           (effectiveness_date IS NOT NULL) DESC,
                           (finish_date IS NOT NULL) DESC,
                           (remarks IS NOT NULL) DESC,
                           (trainer_id IS NOT NULL) DESC,
                           id ASC
                   ) AS rn
            FROM training_participants
            WHERE NOT is_deleted
        )
        UPDATE training_participants
        SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    """)
    op.execute("""
        UPDATE trainings t SET completion = (
            SELECT CASE WHEN COUNT(*) = 0 THEN NULL
                        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE finish_date IS NOT NULL AND effectiveness_date IS NOT NULL) / COUNT(*))
                   END
            FROM training_participants tp WHERE tp.training_id = t.id AND NOT tp.is_deleted
        ), updated_at = CURRENT_TIMESTAMP
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_training_participants_training_worker_active
        ON training_participants (training_id, worker_id)
        WHERE is_deleted = FALSE
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_training_participants_training_worker_active")
    # Soft-deleted-by-dedup rows and the completion values they affected are
    # not restored — this migration's cleanup is not reversible.
