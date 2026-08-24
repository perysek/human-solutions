"""Create workers and personal-data tables (Staamp HR domain, Phase 2)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-08-18

IMPLEMENTATION_PLAN.md §7. `workers` uses the same natural TEXT primary key
strategy as `jobs`/`skills` (cross-cutting decision #1) — legacy ids like
"9001" carry forward unchanged into Phase 8's migration. The personal-data
tables (`birth_data`, `worker_nationality`, `foreigner_data`) are ordinary
SERIAL-keyed detail tables referencing `workers.id` — `worker_id` must be
TEXT to match the FK target's type, which is why the PRD's own ERD (written
against the legacy INTEGER-keyed schema) shows `worker_id INTEGER` where this
migration uses TEXT instead; IMPLEMENTATION_PLAN.md §7 already resolves that
mismatch in favor of TEXT.

Also adds `users.worker_id` (nullable, ON DELETE SET NULL) — completes the
`users` table shape from PRD §8.3. Per OQ_6 (IMPLEMENTATION_PLAN.md §15):
not every user needs a linked worker (superadmin/hr_manager accounts may
have none); `trainer` accounts should be linked so own_data scoping
(own_data_worker_id, Phase 5) has something to scope to.

`worker_nationality.updated_at` is added even though IMPLEMENTATION_PLAN.md
§7's table sketch only lists `created_at` for this one table — cross-cutting
decision #2 mandates created_at/updated_at on every new table universally,
which reads as the controlling rule over that one omission.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workers',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('firstname', sa.Text(), nullable=False),
        sa.Column('surname', sa.Text(), nullable=False),
        sa.Column('job_id', sa.Text(), nullable=True),
        sa.Column('boss_id', sa.Text(), nullable=True),
        sa.Column('gender', sa.Text(), nullable=False, server_default='UNKNOWN'),
        sa.Column('hire_date', sa.Date(), nullable=True),
        sa.Column('fire_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['boss_id'], ['workers.id'], ondelete='SET NULL'),
        sa.CheckConstraint("gender IN ('Male', 'Female', 'UNKNOWN')", name='check_worker_gender'),
    )
    op.create_index('idx_workers_job_id', 'workers', ['job_id'])
    op.create_index('idx_workers_boss_id', 'workers', ['boss_id'])
    op.create_index('idx_workers_fire_date', 'workers', ['fire_date'])

    op.create_table(
        'birth_data',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('birth_date', sa.Date(), nullable=True),
        sa.Column('birth_place', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('worker_id'),
    )

    op.create_table(
        'worker_nationality',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('nationality', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_worker_nationality_worker', 'worker_nationality', ['worker_id'])

    op.create_table(
        'foreigner_data',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('document_kind', sa.Text(), nullable=True),
        sa.Column('document_validity', sa.Date(), nullable=True),
        sa.Column('employment_basis', sa.Text(), nullable=True),
        sa.Column('employment_basis_validity', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('worker_id'),
    )
    op.create_index('idx_foreigner_data_document_validity', 'foreigner_data', ['document_validity'])

    op.add_column('users', sa.Column('worker_id', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_users_worker_id', 'users', 'workers', ['worker_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_users_worker_id', 'users', type_='foreignkey')
    op.drop_column('users', 'worker_id')
    op.drop_table('foreigner_data')
    op.drop_table('worker_nationality')
    op.drop_table('birth_data')
    op.drop_table('workers')
