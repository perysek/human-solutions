"""Create tenants table

Revision ID: c5d6e7f8a9b0
Revises: n3o4p5q6r7s8
Create Date: 2026-08-24

Foundational schema piece for future multi-tenancy (see
MULTI_TENANCY_PROPOSAL.md, SCALING_PREP_PLAN.md Phase 2). No application
code reads this table yet — this migration only creates it and seeds the
single tenant every existing row will be attributed to by the companion
migration that adds `users.tenant_id`.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'n3o4p5q6r7s8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(63), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('plan', sa.String(50), nullable=False, server_default='trial'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.execute(
        "INSERT INTO tenants (slug, name, plan) VALUES ('staamp-poland', 'Staamp Poland', 'internal')"
    )


def downgrade() -> None:
    op.drop_table('tenants')
