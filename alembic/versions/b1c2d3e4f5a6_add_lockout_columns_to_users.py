"""Add account-lockout columns to users (AUTH_5)

Revision ID: b1c2d3e4f5a6
Revises: ea828d25e3db
Create Date: 2026-08-18

Backs the 5-failed-logins account lockout (IMPLEMENTATION_PLAN.md §5.3):
``failed_logins`` counts consecutive bad-password attempts since the last
success; ``locked_until`` holds the timestamp the account auto-unlocks at
(NULL = not locked). Both are plain columns, no FK/CHECK needed — the
business rules (5 attempts, 30-minute lockout) live in
``services/auth/auth_service.py``, not the schema.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'ea828d25e3db'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('failed_logins', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_logins')
