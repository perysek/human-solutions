"""Create medical exams and BHP trainings tables (Staamp HR domain, Phase 4)

Revision ID: dbd528235721
Revises: a6b7c8d9e0f1
Create Date: 2026-08-20 11:39:41.251692

IMPLEMENTATION_PLAN.md §9. Two independent per-worker record tables:
`medical_exams` (MED_5/6) and `bhp_trainings` (BHP_4/5) — each worker can
have many rows (one per exam/training over time), unlike Phase 3's
worker_skills which is one row per (worker, skill). Both are indexed on
worker_id (profile lookups) and valid_until (the expiring-soon reports and,
eventually, Phase 6's dashboard).

`bhp_trainings` has no `description` column even though `medical_exams`
does — matching §9's own table sketch, not an oversight. A BHP training's
`kind` (Initial/Periodic/Control) already says what it is; a medical exam's
`kind` (Preliminary/Periodic) doesn't distinguish *what was examined*, which
is what `description` is for.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'dbd528235721'
down_revision: Union[str, None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'medical_exams',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('performed_on', sa.Date(), nullable=False),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.CheckConstraint("kind IN ('Preliminary', 'Periodic')", name='check_medical_exams_kind'),
    )
    op.create_index('idx_medical_exams_worker', 'medical_exams', ['worker_id'])
    op.create_index('idx_medical_exams_valid_until', 'medical_exams', ['valid_until'])

    op.create_table(
        'bhp_trainings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('training_date', sa.Date(), nullable=False),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.CheckConstraint("kind IN ('Initial', 'Periodic', 'Control')", name='check_bhp_trainings_kind'),
    )
    op.create_index('idx_bhp_trainings_worker', 'bhp_trainings', ['worker_id'])
    op.create_index('idx_bhp_trainings_valid_until', 'bhp_trainings', ['valid_until'])


def downgrade() -> None:
    op.drop_table('bhp_trainings')
    op.drop_table('medical_exams')
