"""merge_presence_confirmation_and_trainer_level

Revision ID: 6cedd0e86dde
Revises: a658de63e223, b8c9d0e1f2a3
Create Date: 2026-08-24 06:27:37.922961

Pure merge point — no-op up/down. Two independent branches grew off
a7b8c9d0e1f2 at the same time from two separate workstreams:

  * a658de63e223 (MOBILE_PRESENCE_CONFIRMATION_PLAN.md) — adds
    `training_sign_in_tokens` / `training_presence_confirmations`. Additive
    only, touches no existing column.
  * b8c9d0e1f2a3 (move_trainer_to_training_level) — adds `training_trainers`
    and DROPS `training_participants.trainer_id`.

Schema-wise the two don't conflict (disjoint tables, and neither of the new
presence-confirmation tables references trainer_id). They're joined here
only to give `alembic heads`/`upgrade head` a single target again — this
does NOT by itself mean b8c9d0e1f2a3 is safe to run yet: as of this merge,
routes/trainings/routes.py, repositories/trainings/training_participant_repository.py
(_SELECT/_HISTORY_SELECT), and the frontend's TrainingParticipant type still
read/write tp.trainer_id directly. Applying b8c9d0e1f2a3 (and this merge)
before that call-site migration lands will break those queries with
UndefinedColumn. Confirm that work is finished before `alembic upgrade head`
past this point.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6cedd0e86dde'
down_revision: Union[str, None] = ('a658de63e223', 'b8c9d0e1f2a3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
