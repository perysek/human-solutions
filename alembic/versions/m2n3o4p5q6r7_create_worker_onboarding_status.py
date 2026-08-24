"""Create worker_onboarding_status table + training_participants.is_onboarding

Revision ID: m2n3o4p5q6r7
Revises: k1l2m3n4o5p6
Create Date: 2026-08-24

Backs the "Szkolenia wstępne" (onboarding trainings) flow reached from
WorkerViewPage: HR picks a subset of the trainings linked to the worker's
job position (`training_job`) and bulk-schedules them as enrollments.

`training_participants.is_onboarding` marks which enrollment rows came from
that bulk-schedule flow (vs. a plain TRN_8 add on TrainingViewPage) — it's
what `worker_onboarding_status` is derived FROM, not a duplicate of it.

`worker_onboarding_status` is the "employee & job-position combined index"
table: one row per (worker_id, job_id), `completed`/`completion_pct`
recalculated from the worker's onboarding-flagged roster every time it
changes (services/worker_onboarding_service.py — same recompute-on-write
shape as trainings.completion). Keyed by job_id, not just worker_id,
because a worker who changes job position starts a fresh onboarding cycle
for the new job — the old job's row is left as history rather than reused.
No row at all means "Nie zaplanowane" (never bulk-scheduled); the UNIQUE
(worker_id, job_id) index is both the upsert target and the "combined
index" the feature was specced with.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'm2n3o4p5q6r7'
down_revision: Union[str, None] = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'training_participants',
        sa.Column('is_onboarding', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        'worker_onboarding_status',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('job_id', sa.Text(), nullable=False),
        sa.Column('completed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('completion_pct', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('worker_id', 'job_id', name='uq_worker_onboarding_status_worker_job'),
    )


def downgrade() -> None:
    op.drop_table('worker_onboarding_status')
    op.drop_column('training_participants', 'is_onboarding')
