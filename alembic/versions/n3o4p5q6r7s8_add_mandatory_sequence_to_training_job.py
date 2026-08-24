"""Add is_mandatory + sequence_order to training_job

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-08-24

Per-relationship metadata on `training_job` — the same "join table carries
extra columns beyond the pure link" shape `job_skills.required_rating`
already uses (migration d3e4f5a6b7c8), not a new key/table. A training's
role within a job's onboarding curriculum is a property of *that job's use
of it*, not of the training itself: the same training can be optional for
one job and mandatory+first-to-complete for another.

`is_mandatory` defaults TRUE — every training linked to a job's curriculum
today implicitly was, this just makes it explicit and overridable.

`sequence_order` (nullable) is deliberately not a boolean `is_first` flag —
"first to complete" is just `sequence_order = 1` (or `MIN(sequence_order)`
per job), and the same column gives full curriculum step-ordering for free
later without another migration. NULL means "unordered" — not part of any
enforced sequence. The partial unique index only constrains rows that
opted into ordering, so two unordered links for the same job never conflict.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'n3o4p5q6r7s8'
down_revision: Union[str, None] = 'm2n3o4p5q6r7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'training_job',
        sa.Column('is_mandatory', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        'training_job',
        sa.Column('sequence_order', sa.Integer(), nullable=True),
    )
    op.create_index(
        'uq_training_job_job_sequence',
        'training_job',
        ['job_id', 'sequence_order'],
        unique=True,
        postgresql_where=sa.text('sequence_order IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_training_job_job_sequence', table_name='training_job')
    op.drop_column('training_job', 'sequence_order')
    op.drop_column('training_job', 'is_mandatory')
