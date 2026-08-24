"""Create jobs and skills dictionary tables (Staamp HR domain, Phase 1)

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-08-18

IMPLEMENTATION_PLAN.md §6. Pure dictionary tables — no FK dependency on
`workers` (Phase 2) or anything else, so they can land first and unblock
every later phase's foreign keys (`workers.job_id`, `job_skills`,
`worker_skills`, `training_job`, `training_skills`, ...).

Natural TEXT primary keys (cross-cutting decision #1, IMPLEMENTATION_PLAN.md
§2.1): legacy SQLite ids like `jobs.id = "BRYGADZISTA"` are meaningful,
already-in-use codes (referenced in paper HR documents/reports), not
surrogate integers — carrying them forward as the PK avoids an id-remapping
table when Phase 8 migrates the legacy data, and `id` doubles as the
human-readable code (there is no separate `name` column).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'jobs',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'skills',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('skills')
    op.drop_table('jobs')
