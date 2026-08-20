"""add_worker_id_to_users

Revision ID: 3144e1f9ace7
Revises: dbd528235721
Create Date: 2026-08-20 14:11:35.302365

Closes a gap IMPLEMENTATION_PLAN.md flagged back in its Phase 0 pre-work
(§5's "stan obecny" audit) but that no phase actually needed until now:
`users.worker_id`, nullable, linking a login account to the `workers` row it
represents. `failed_logins`/`locked_until` (the migration's siblings from
that same audit) landed in Phase 0 because AUTH_5 needed them immediately;
`worker_id` didn't have a consumer until Phase 5's `own_data_worker_id()`
(cross-cutting decision #6) — a trainer's "edit only my own trainings" gate
reads this column directly off the logged-in user, no join required.

Nullable per OQ_6 (confirmed): `superadmin`/`hr_manager` accounts need no
worker row; `trainer` accounts should have one, but `own_data_worker_id()`
degrades safely (sentinel `-1`) if one doesn't. ON DELETE SET NULL — a
worker leaving (or, rare, a hard-deleted worker row) must not cascade into
deleting the *login account*, just detach it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3144e1f9ace7'
down_revision: Union[str, None] = 'dbd528235721'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('worker_id', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_users_worker_id', 'users', 'workers', ['worker_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_users_worker_id', 'users', type_='foreignkey')
    op.drop_column('users', 'worker_id')
