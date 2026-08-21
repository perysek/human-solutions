"""Link action_plans to a training enrollment (LUK_1 "Szkolenie" checkbox)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-21

The gap-report's "plan działania" modal gets a second creation mode: instead
of a free-text corrective action, HR can flag the plan as "Szkolenie" and
point it at an internal training. Creating that kind of plan auto-enrolls
the worker (a training_participants row) and, once that enrollment's
`finish_date` AND `effectiveness_date` are both confirmed (the existing
TRN_8/9 participant-edit flow — no new UI needed there), the worker's
current_rating for the gap's skill is bumped by `expected_increase` (capped
at 3, the schema-wide max — see check_worker_skills_current_rating).

Five columns, all nullable/defaulted so existing rows and the plain
(non-training) creation path are unaffected:

- `is_training` — discriminates the two creation modes for the frontend
  (which fields the edit view can show) without inferring it from
  training_id being non-null (a training's own row could theoretically be
  deleted independently — SET NULL below — while the plan itself must still
  read as "this was a training-linked plan").
- `training_id` — SET NULL like `responsible_id`: the training being
  deleted must not erase the action plan's history, only its link.
- `training_participant_id` — the *specific* enrollment this plan created,
  not just "worker X in training Y" (which wouldn't disambiguate a worker
  attending the same training on two different occasions). SET NULL for the
  same reason as training_id.
- `expected_increase` — 1-3, same scale as worker_skills.current_rating.
- `skill_increase_applied` — set once the bump fires, so re-editing the
  enrollment afterwards (e.g. fixing a typo in remarks) can never re-apply
  or double-apply the increase.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('action_plans', sa.Column('is_training', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('action_plans', sa.Column('training_id', sa.Integer(), nullable=True))
    op.add_column('action_plans', sa.Column('training_participant_id', sa.Integer(), nullable=True))
    op.add_column('action_plans', sa.Column('expected_increase', sa.Integer(), nullable=True))
    op.add_column('action_plans', sa.Column('skill_increase_applied', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_foreign_key(
        'fk_action_plans_training', 'action_plans', 'trainings',
        ['training_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_action_plans_training_participant', 'action_plans', 'training_participants',
        ['training_participant_id'], ['id'], ondelete='SET NULL',
    )
    op.create_check_constraint(
        'check_action_plans_expected_increase', 'action_plans',
        'expected_increase IS NULL OR expected_increase BETWEEN 1 AND 3',
    )
    op.create_index('idx_action_plans_training', 'action_plans', ['training_id'])
    op.create_index('idx_action_plans_training_participant', 'action_plans', ['training_participant_id'])


def downgrade() -> None:
    op.drop_index('idx_action_plans_training_participant', table_name='action_plans')
    op.drop_index('idx_action_plans_training', table_name='action_plans')
    op.drop_constraint('check_action_plans_expected_increase', 'action_plans', type_='check')
    op.drop_constraint('fk_action_plans_training_participant', 'action_plans', type_='foreignkey')
    op.drop_constraint('fk_action_plans_training', 'action_plans', type_='foreignkey')
    op.drop_column('action_plans', 'skill_increase_applied')
    op.drop_column('action_plans', 'expected_increase')
    op.drop_column('action_plans', 'training_participant_id')
    op.drop_column('action_plans', 'training_id')
    op.drop_column('action_plans', 'is_training')
