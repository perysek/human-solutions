"""create_presence_confirmation_tables

Revision ID: a658de63e223
Revises: a7b8c9d0e1f2
Create Date: 2026-08-24 06:09:02.860251

MOBILE_PRESENCE_CONFIRMATION_PLAN.md §3 — replaces the printed "lista
obecności" + wet signature at in-person trainings. Two tables, deliberately
kept separate from `training_participants` rather than adding columns to it,
so the employee-submitted, write-once confirmation never shares a row with
the admin-editable enrollment record (`start_date`/`remarks`/`trainer_id`/
`effectiveness_date`) — same normalization instinct as `birth_data`/
`foreigner_data` being split off `workers` (f5a6b7c8d9e0).

- `training_sign_in_tokens` — one row per generated QR/link for a training's
  session (HR/Trainer-minted, `secrets.token_urlsafe(32)` — same primitive
  as `password_reset_tokens`). `revoked_at` lets HR close the window early;
  `expires_at` is the automatic close. No UPDATE beyond revoke — regenerating
  means a new row, old one revoked.
- `training_presence_confirmations` — one row per participant's self-
  submitted attendance confirmation. `UniqueConstraint('training_participant_id')`
  is the DB-level backstop making a duplicate confirmation impossible, not
  just unlikely (same belt-and-suspenders shape as a7b8c9d0e1f2's partial
  unique index) — the service layer checks first for a friendly 409.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a658de63e223'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'training_sign_in_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.Text(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_id'], ['trainings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('token'),
    )
    op.create_index('idx_sign_in_tokens_training', 'training_sign_in_tokens', ['training_id'])

    op.create_table(
        'training_presence_confirmations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_participant_id', sa.Integer(), nullable=False),
        sa.Column('sign_in_token_id', sa.Integer(), nullable=True),
        sa.Column('signature_name', sa.Text(), nullable=False),
        sa.Column('signature_svg', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.Text(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_participant_id'], ['training_participants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sign_in_token_id'], ['training_sign_in_tokens.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('training_participant_id'),
    )


def downgrade() -> None:
    op.drop_table('training_presence_confirmations')
    op.drop_index('idx_sign_in_tokens_training', table_name='training_sign_in_tokens')
    op.drop_table('training_sign_in_tokens')
