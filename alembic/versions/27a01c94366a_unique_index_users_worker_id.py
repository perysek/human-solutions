"""Enforce one login account per worker (users.worker_id)

Revision ID: 27a01c94366a
Revises: ab01absc0003
Create Date: 2026-09-08

`users.worker_id` (migration f5a6b7c8d9e0) has never had a uniqueness
constraint — nothing wrote to it outside scripts/seed_dev_data.py's one
hand-picked dev account, so it never mattered. The new user-employee
linkage admin UI (UserForm's "Pracownik" picker) makes it a real, editable
field: without this, two accounts could both point at the same worker,
which would silently break `_current_worker_id()`-driven absence
self-service (WorkerRepository's `linked_user_*` LEFT JOIN would fan a
worker row out into duplicates on the list/profile endpoints).

Partial (`WHERE worker_id IS NOT NULL`) so any number of unlinked accounts
(NULL) coexist — same shape as idx_jobs_one_director /
idx_jobs_one_manager_per_department, the app's existing "at most one X"
pattern.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '27a01c94366a'
down_revision: Union[str, None] = 'ab01absc0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_worker_id_unique
        ON users (worker_id)
        WHERE worker_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_worker_id_unique")
