"""Create action_plans table (LUK_1 corrective-action tracking)

Revision ID: c3d4e5f6a7b8
Revises: 9c1d2e3f4a5b
Create Date: 2026-08-21

One row per corrective action raised against a specific competency gap
(worker_id + skill_id — not job_id: a worker's job can change after the
action is raised, but the gap it was created for shouldn't retroactively
change meaning). Three date columns rather than one, mirroring
`training_participants.effectiveness_date`'s precedent (Phase 5) for the
same "verified effective, not just done" distinction:

- `planned_date` — when the action is due (set at creation, required).
- `completed_date` — when it was actually carried out.
- `effectiveness_date` — when it was verified to have closed the gap.

`status` is a separate explicit column rather than derived from which
dates are filled, because the frontend's colored-status picker (LUK_1's
"plan działania" modal) needs one unambiguous value to render — deriving
it from date presence would make "W trakcie" vs "Zdefiniowane" ambiguous
whenever a date is back-filled out of order.

`responsible_id` is nullable with ON DELETE SET NULL (same shape as
`training_participants.trainer_id`): the responsible worker leaving the
company must not delete the action's history, just blank out who owned
it. `worker_id`/`skill_id` CASCADE instead — an action plan has no
meaning once the worker or skill it targets is gone.

No separate history table: AuditableMixin's per-field old/new audit_log
rows (same mechanism as worker_skills' SKL_5) are the "full history" this
was built for — see repositories/workers/action_plan_repository.py.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = '9c1d2e3f4a5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'action_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('skill_id', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('responsible_id', sa.Text(), nullable=True),
        sa.Column('planned_date', sa.Date(), nullable=False),
        sa.Column('completed_date', sa.Date(), nullable=True),
        sa.Column('effectiveness_date', sa.Date(), nullable=True),
        sa.Column('status', sa.Text(), nullable=False, server_default='defined'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['skill_id'], ['skills.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['responsible_id'], ['workers.id'], ondelete='SET NULL'),
        sa.CheckConstraint(
            "status IN ('defined', 'in_progress', 'completed', 'effective')",
            name='check_action_plans_status',
        ),
    )
    op.create_index('idx_action_plans_worker', 'action_plans', ['worker_id'])
    op.create_index('idx_action_plans_skill', 'action_plans', ['skill_id'])
    op.create_index('idx_action_plans_responsible', 'action_plans', ['responsible_id'])
    op.create_index('idx_action_plans_status', 'action_plans', ['status'])


def downgrade() -> None:
    op.drop_table('action_plans')
