"""Add jobs.is_director — company-wide top-priority supervisor flag

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-24

"Dyrektor zakładu" — a second, company-wide tier above the existing
per-department "stanowisko kierownicze" tier. A job-position flagged
is_director=TRUE becomes the supervisor_job for every is_managerial=TRUE
job-position (see JobRepository._columns's dj join/CASE), the same way a
department's kierownicze job is already the derived supervisor for that
department's regular job-positions.

`idx_jobs_one_director` mirrors idx_jobs_one_manager_per_department
(migration d1e2f3a4b5c6) but company-wide (no department_id scoping) — a
partial unique index on the flag itself, restricted by its own WHERE clause,
so at most one row can ever have is_director = TRUE. Unlike the manager
guard, routes/jobs/routes.py does NOT pre-check-and-block on this: setting a
new director auto-clears the previous one and returns a non-blocking warning
instead of a 409, so this index is a pure safety net, not the primary UX.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('is_director', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_one_director
        ON jobs (is_director)
        WHERE is_director = TRUE
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_jobs_one_director")
    op.drop_column('jobs', 'is_director')
