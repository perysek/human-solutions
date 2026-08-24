"""Add departments dictionary table + jobs.department_id/is_managerial

Revision ID: c9d0e1f2a3b4
Revises: 6cedd0e86dde
Create Date: 2026-08-24

New "Działy firmy" dictionary table, serial-PK (unlike jobs/skills' natural
TEXT key — a department has no pre-existing legacy code to carry forward,
`name` is the human-entered identifier, same shape as `roles`).

`jobs.department_id` is nullable (a job-position can exist with no
department, same optionality as `workers.job_id`/`workers.boss_id`) and
ON DELETE RESTRICT — a department referenced by any job-position can't be
hard-deleted, mirroring `workers.job_id` -> `jobs.id`'s existing RESTRICT
(see JobRepository.count_blocking_references's docstring for the pattern
this follows; DepartmentRepository.count_blocking_references does the same
for jobs referencing a department).

`jobs.is_managerial` (typ stanowiska: kierownicze/nie-kierownicze) is a
plain boolean, NOT NULL DEFAULT FALSE — every existing job-position becomes
"nie-kierownicze" on upgrade, the safe default since nothing prior recorded
this distinction.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = '6cedd0e86dde'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'departments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_departments_name'),
    )

    op.add_column('jobs', sa.Column('department_id', sa.Integer(), nullable=True))
    op.add_column('jobs', sa.Column('is_managerial', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_foreign_key(
        'fk_jobs_department_id', 'jobs', 'departments',
        ['department_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('ix_jobs_department_id', 'jobs', ['department_id'])


def downgrade() -> None:
    op.drop_index('ix_jobs_department_id', table_name='jobs')
    op.drop_constraint('fk_jobs_department_id', 'jobs', type_='foreignkey')
    op.drop_column('jobs', 'is_managerial')
    op.drop_column('jobs', 'department_id')
    op.drop_table('departments')
