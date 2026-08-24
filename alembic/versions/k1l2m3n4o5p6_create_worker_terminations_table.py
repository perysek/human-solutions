"""Create worker_terminations table (Staamp HR domain — notice-of-termination workflow)

Revision ID: k1l2m3n4o5p6
Revises: f3a4b5c6d7e8
Create Date: 2026-08-24

Backs the new "Złożenie wypowiedzenia" (notice submission) workflow that
replaces the old instant "Dezaktywuj" button: HR submits a notice
(submission_date + reason + notice_period_days, optionally shortened from
the Kodeks-pracy-derived default with a required shortening_reason), and
`workers.fire_date`/inactive status only get set once `planned_fire_date`
is actually reached (services/worker_service.py's
finalize_due_terminations, evaluated lazily on the read paths that surface
worker status — this app has no background scheduler, see
config/runtime_guards.py's single-worker rationale).

`workers.hire_date`/`fire_date` already exist (migration
f5a6b7c8d9e0) — no change needed there; this migration only adds the new
notice-tracking table.

One pending notice per worker at a time (partial unique index on
worker_id WHERE status='pending') — mirrors the "single open X per Y"
pattern already used for action plans (migration d1e2f3a4b5c6) and
training participants (a7b8c9d0e1f2).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'f3a4b5c6d7e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'worker_terminations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('submission_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('notice_period_days', sa.Integer(), nullable=False),
        sa.Column('default_notice_period_days', sa.Integer(), nullable=False),
        sa.Column('shortening_reason', sa.Text(), nullable=True),
        sa.Column('planned_fire_date', sa.Date(), nullable=False),
        sa.Column('status', sa.Text(), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.CheckConstraint("status IN ('pending', 'finalized')", name='check_worker_termination_status'),
        sa.CheckConstraint('notice_period_days >= 0', name='check_worker_termination_notice_period_days'),
    )
    op.create_index('idx_worker_terminations_worker_id', 'worker_terminations', ['worker_id'])
    op.create_index(
        'idx_worker_terminations_status_planned_fire_date', 'worker_terminations',
        ['status', 'planned_fire_date'],
    )
    op.create_index(
        'ux_worker_terminations_one_pending', 'worker_terminations', ['worker_id'],
        unique=True, postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index('ux_worker_terminations_one_pending', table_name='worker_terminations')
    op.drop_index('idx_worker_terminations_status_planned_fire_date', table_name='worker_terminations')
    op.drop_index('idx_worker_terminations_worker_id', table_name='worker_terminations')
    op.drop_table('worker_terminations')
