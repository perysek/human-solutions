"""Add soft delete (is_deleted, deleted_at) to action_plans

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-21

The "Plany działań" tracking table gets a delete action (dimmed-red icon,
row-hover reveal — same `.action-icon-btn.danger-reveal` pattern already
used on Jobs/Skills/Roles/Users list pages). Soft, not hard: unlike a job or
a skill, an action plan is either itself a corrective-action record or (for
LUK_1's "Szkolenie" plans) linked to a real training_participants enrollment
— hard-deleting it would blow away that history and, for a training-linked
plan, orphan the enrollment's own audit trail's context. `is_deleted`/
`deleted_at` mirrors e9f0a1b2c3d4's existing shape (invoices/appointments/
clients) — BaseRepository's `_soft_delete` flag already knows how to work
this pattern, action_plans is just its first real user.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('action_plans', sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('action_plans', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('idx_action_plans_is_deleted', 'action_plans', ['is_deleted'])


def downgrade() -> None:
    op.drop_index('idx_action_plans_is_deleted', table_name='action_plans')
    op.drop_column('action_plans', 'deleted_at')
    op.drop_column('action_plans', 'is_deleted')
