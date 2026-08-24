"""create_trainings_tables

Revision ID: 7e2feddd7715
Revises: 3144e1f9ace7
Create Date: 2026-08-20 14:11:40.209785

IMPLEMENTATION_PLAN.md §10 (Faza 5). Four tables:

- `trainings` — one row per training event/course. Indexed on `training_date`
  (`idx_trainings_date`, TRN_1's default catalog sort).
- `training_participants` — the big one (~6612 rows per the plan's data
  estimate), one row per (training, worker) enrollment. Indexed on all three
  FK columns: `training`/`worker` for the obvious lookups (TRN_5/TRN_10), and
  `trainer` specifically so a trainer's "which trainings am I running"
  filter (TRN_7's ownership check, `TrainingRepository.is_trainer_of`) is an
  index seek, not a sequential scan of the largest table in the schema.
- `training_job` / `training_skills` — pure link tables (training <-> the
  jobs/skills it's relevant to, TRN_3/TRN_4), same UNIQUE-pair + CASCADE
  shape as Phase 3's `job_skills`.

All four FK to their parent with ON DELETE CASCADE except
`training_participants.trainer_id`, which is ON DELETE SET NULL — a trainer
(a `workers` row) leaving the company must not delete the historical
enrollment record of everyone they ever trained, just blank out who ran it.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '7e2feddd7715'
down_revision: Union[str, None] = '3144e1f9ace7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trainings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('training_date', sa.Date(), nullable=True),
        sa.Column('completion', sa.Integer(), nullable=True),
        sa.Column('related_docs', sa.Text(), nullable=True),
        sa.Column('training_details', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_trainings_date', 'trainings', ['training_date'])

    op.create_table(
        'training_participants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('finish_date', sa.Date(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('trainer_id', sa.Text(), nullable=True),
        sa.Column('effectiveness_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_id'], ['trainings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trainer_id'], ['workers.id'], ondelete='SET NULL'),
    )
    op.create_index('idx_training_participants_training', 'training_participants', ['training_id'])
    op.create_index('idx_training_participants_worker', 'training_participants', ['worker_id'])
    op.create_index('idx_training_participants_trainer', 'training_participants', ['trainer_id'])

    op.create_table(
        'training_job',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_id'], ['trainings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('training_id', 'job_id', name='uq_training_job'),
    )

    op.create_table(
        'training_skills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_id', sa.Integer(), nullable=False),
        sa.Column('skill_id', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_id'], ['trainings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['skill_id'], ['skills.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('training_id', 'skill_id', name='uq_training_skills'),
    )


def downgrade() -> None:
    op.drop_table('training_skills')
    op.drop_table('training_job')
    op.drop_table('training_participants')
    op.drop_table('trainings')
