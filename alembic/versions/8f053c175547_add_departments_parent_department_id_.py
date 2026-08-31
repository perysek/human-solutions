"""Add departments.parent_department_id for multi-tier org hierarchy

Revision ID: 8f053c175547
Revises: d6e7f8a9b0c1
Create Date: 2026-08-31

Product need: an org-chart diagram, and a hierarchy deeper than the current
fixed 2 levels (jobs.is_director company-wide, jobs.is_managerial one per
department — see migrations c9d0e1f2a3b4/f3a4b5c6d7e8/d1e2f3a4b5c6). That
fixed depth can't represent a division containing several departments, or a
department containing sub-teams each with their own lead.

Deliberately NOT a worker-level `manager_id` (that was `workers.boss_id`,
created in f5a6b7c8d9e0 and dropped again the same day in
e2f3a4b5c6d7 — "supervisor is now derived from job hierarchy" — precisely
because a stored per-worker supervisor can silently drift from the real
answer once a worker's job/department changes and nobody remembers to update
the stray column). This migration extends that same *derived, not stored*
principle instead of abandoning it: `departments.parent_department_id` lets
the existing "one is_managerial job per department" derivation
(idx_jobs_one_manager_per_department, migration d1e2f3a4b5c6) recurse up an
arbitrary number of department levels instead of stopping at one. Nothing
about `jobs`/`workers` changes, and neither does the manager-per-department
uniqueness guarantee — it still holds at every level of the new tree.

Resulting derived chain, arbitrary depth:
    jobs.is_director (company-wide, department-agnostic root)
      -> manager of each top-level department (parent_department_id IS NULL)
        -> manager of each of its child departments, recursively
          -> ... -> regular workers in a leaf department

Nullable + ON DELETE RESTRICT, mirroring jobs.department_id's existing
optionality/RESTRICT pattern (migration c9d0e1f2a3b4) — a department with no
parent is a top-level department (today's status quo for every existing
row on upgrade), and a department still referenced as someone's parent can't
be hard-deleted.

Cycle prevention (a department can't become its own ancestor) is NOT
enforced by this migration — Postgres has no native "acyclic" constraint for
a self-referencing FK, and this codebase's own precedent (d1e2f3a4b5c6's
docstring, re: medical_exams/bhp_trainings' "at most one current row" rule)
is to enforce what a static index predicate can't express at the repository
layer instead. DepartmentRepository/DepartmentService need a walk-the-ancestry
check before writing `parent_department_id` — tracked as a required
follow-up, not part of this schema change. With department counts in the
dozens (not thousands), that check is cheap and unremarkable.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = '8f053c175547'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('departments', sa.Column('parent_department_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_departments_parent_department_id', 'departments', 'departments',
        ['parent_department_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('idx_departments_parent_department_id', 'departments', ['parent_department_id'])


def downgrade() -> None:
    op.drop_index('idx_departments_parent_department_id', table_name='departments')
    op.drop_constraint('fk_departments_parent_department_id', 'departments', type_='foreignkey')
    op.drop_column('departments', 'parent_department_id')
