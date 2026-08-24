"""Move trainer from training_participants to training-level (training_trainers)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-24

`training_participants.trainer_id` modeled "who trained this one person",
but a training's roster is actually run by one or more trainers shared
across the whole session, not chosen per attendee — the old shape let two
participants of the *same* training end up with two different trainers,
which was never a real distinction the product wanted. This moves the
relationship to the training itself via a new `training_trainers` link
table, same CASCADE/UNIQUE-pair shape as `training_job`/`training_skills`
(7e2feddd7715) rather than `training_participants.trainer_id`'s old
ON DELETE SET NULL — there's no per-row history to preserve here, a link
table row has no meaning once either side is gone.

Existing (training_id, trainer_id) pairs are backfilled from every
`training_participants` row that had a trainer set (deleted or not — a
soft-deleted enrollment shouldn't erase the fact that this training was
run by that trainer), deduped by the UNIQUE constraint. `trainer_id` is
then dropped from `training_participants` entirely.

Downgrade restores the column and index but NOT the data — which
participant had which trainer is genuinely gone once collapsed to the
training level (same one-way limitation as a7b8c9d0e1f2's cleanup).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'training_trainers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_id', sa.Integer(), nullable=False),
        sa.Column('trainer_id', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_id'], ['trainings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trainer_id'], ['workers.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('training_id', 'trainer_id', name='uq_training_trainers'),
    )
    op.create_index('idx_training_trainers_training', 'training_trainers', ['training_id'])
    op.create_index('idx_training_trainers_trainer', 'training_trainers', ['trainer_id'])

    op.execute("""
        INSERT INTO training_trainers (training_id, trainer_id)
        SELECT DISTINCT training_id, trainer_id
        FROM training_participants
        WHERE trainer_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_training_trainers DO NOTHING
    """)

    op.drop_index('idx_training_participants_trainer', table_name='training_participants')
    op.drop_column('training_participants', 'trainer_id')


def downgrade() -> None:
    op.add_column('training_participants', sa.Column('trainer_id', sa.Text(), nullable=True))
    op.create_index('idx_training_participants_trainer', 'training_participants', ['trainer_id'])
    op.create_foreign_key(
        'training_participants_trainer_id_fkey', 'training_participants', 'workers',
        ['trainer_id'], ['id'], ondelete='SET NULL',
    )
    # Per-participant trainer assignment is not restored — see module docstring.
    op.drop_table('training_trainers')
