"""Add tenant_id to users

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-08-24

Backfills every existing user onto the single seeded tenant
('staamp-poland'), then locks the column NOT NULL. One combined
add-column/backfill/not-null migration is fine at today's scale (one
tenant, a small `users` table) — split into separate zero-downtime-safe
revisions only once Phase C of MULTI_TENANCY_PROPOSAL.md actually runs
against a live multi-tenant dataset (see SCALING_PREP_PLAN.md Phase 2).

Nothing reads `users.tenant_id` yet — no middleware, no RLS, no query
changes. Purely: the column exists, is backfilled, is NOT NULL, is indexed.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('tenant_id', sa.Integer(), nullable=True))
    op.execute(
        "UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'staamp-poland')"
    )
    op.alter_column('users', 'tenant_id', nullable=False)
    op.create_foreign_key('fk_users_tenant_id', 'users', 'tenants', ['tenant_id'], ['id'])
    op.create_index('idx_users_tenant_id', 'users', ['tenant_id'])


def downgrade() -> None:
    op.drop_index('idx_users_tenant_id', table_name='users')
    op.drop_constraint('fk_users_tenant_id', 'users', type_='foreignkey')
    op.drop_column('users', 'tenant_id')
