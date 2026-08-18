"""Create competency matrix tables (Staamp HR domain, Phase 3)

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-08-18

IMPLEMENTATION_PLAN.md §8. Three tables: `job_skills` (a job's required
skills + minimum rating, JOB_2/JOB_4), `worker_skills` (a worker's actual
rating per skill, SKL_2), `worker_skill_remarks` (free-text notes on one
worker's rating for one skill, SKL_3).

`job_skills.updated_at` is added even though §8's table sketch only lists
`created_at` — cross-cutting decision #2 (created_at/updated_at on every new
table) plus JOB_4 explicitly allowing the required_rating to be edited make
this a state-row like `worker_skills` (which the plan's own sketch DOES give
both timestamps), not an append-only log. `worker_skill_remarks` keeps only
`created_at` on purpose: a remark is written once and never edited in place
(SKL_5's "historia zmian" is the rating's audit trail, not a remark's) — the
correction workflow is "add a new remark", not "edit the old one", which
already lines up with this app's broader "audit_log itself is immutable"
convention (AUD_2).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'job_skills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Text(), nullable=False),
        sa.Column('skill_id', sa.Text(), nullable=False),
        sa.Column('required_rating', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['skill_id'], ['skills.id'], ondelete='CASCADE'),
        sa.CheckConstraint('required_rating BETWEEN 1 AND 3', name='check_job_skills_required_rating'),
        sa.UniqueConstraint('job_id', 'skill_id'),
    )

    op.create_table(
        'worker_skills',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('skill_id', sa.Text(), nullable=False),
        sa.Column('current_rating', sa.Integer(), nullable=True),
        sa.Column('last_update', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['skill_id'], ['skills.id'], ondelete='CASCADE'),
        sa.CheckConstraint('current_rating BETWEEN 1 AND 3', name='check_worker_skills_current_rating'),
        sa.UniqueConstraint('worker_id', 'skill_id'),
    )
    op.create_index('idx_worker_skills_skill_id', 'worker_skills', ['skill_id'])

    op.create_table(
        'worker_skill_remarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_skill_id', sa.Integer(), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_skill_id'], ['worker_skills.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_worker_skill_remarks_worker_skill', 'worker_skill_remarks', ['worker_skill_id'])


def downgrade() -> None:
    op.drop_table('worker_skill_remarks')
    op.drop_table('worker_skills')
    op.drop_table('job_skills')
