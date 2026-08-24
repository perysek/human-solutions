"""Drop workers.boss_id — supervisor is now derived from job hierarchy

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-24

Product decision: "przełożony" (a worker's supervisor) is no longer a
manually-assigned field on the worker themselves — it's derived the same way
"kierownik działu" already is (DepartmentRepository._SELECT's manager_names,
JobRepository's supervisor_job_id): a worker's boss is whoever holds the
is_managerial=TRUE job in their own job's department
(idx_jobs_one_manager_per_department already guarantees at most one such
job per department). WorkerRepository/WorkerSkillRepository now compute this
via a join instead of reading the stored column — see their own docstrings.

This drops `workers.boss_id` (self-referencing FK + its index) outright
rather than leaving it as dead data — the "Przełożony" select this backed
is being removed from WorkerForm in the same change, so nothing writes to it
going forward, and leaving a column no code path reads or writes would only
invite drift. 30 workers had boss_id set on the dev DB at the time of
writing; that data does not survive the downgrade (the column comes back
NULL-only) — it was a manual assignment already superseded by the derived
job-hierarchy answer, not information unique to this migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('workers_boss_id_fkey', 'workers', type_='foreignkey')
    op.drop_index('idx_workers_boss_id', table_name='workers')
    op.drop_column('workers', 'boss_id')


def downgrade() -> None:
    op.add_column('workers', sa.Column('boss_id', sa.Text(), nullable=True))
    op.create_index('idx_workers_boss_id', 'workers', ['boss_id'])
    op.create_foreign_key(
        'workers_boss_id_fkey', 'workers', 'workers', ['boss_id'], ['id'], ondelete='SET NULL'
    )
