"""Add soft delete (is_deleted, deleted_at) to training_participants

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-24

"Uczestnicy" table on the internal-training detail page gets a delete
action (same `.action-icon-btn.danger-reveal` pattern as action_plans,
e5f6a7b8c9d0). Soft, not hard — training_participants carries the
attendance/effectiveness history (start_date/finish_date/effectiveness_date,
remarks) that LUK_1's training-linked action plans key off of
(training_participant_id) — hard-deleting the row would orphan that FK and
silently blow away a record that may have already fed a competency-rating
bump. `is_deleted`/`deleted_at` mirrors e5f6a7b8c9d0's shape; BaseRepository's
`_soft_delete` flag already knows how to work it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('training_participants', sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('training_participants', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    op.create_index('idx_training_participants_is_deleted', 'training_participants', ['is_deleted'])


def downgrade() -> None:
    op.drop_index('idx_training_participants_is_deleted', table_name='training_participants')
    op.drop_column('training_participants', 'deleted_at')
    op.drop_column('training_participants', 'is_deleted')
