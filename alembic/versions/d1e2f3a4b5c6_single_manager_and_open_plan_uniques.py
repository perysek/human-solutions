"""Partial unique indexes: one manager per department, one open action plan per worker+skill

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-08-24

Two independent business-rule guards, both expressible as static (IMMUTABLE)
partial-unique-index predicates — same shape as the existing
idx_training_participants_training_worker_active (migration
a7b8c9d0e1f2) and idx_invoices_invoice_number_active (g1h2i3j4k5l6):

1. `jobs`: at most one 'kierownicze' (is_managerial=TRUE) job-position per
   department. routes/jobs/routes.py and routes/departments/routes.py's
   api_add_jobs both pre-check this before writing (friendly Polish
   ConflictError) — this index is the hard guarantee for the rare race a
   pre-check can't catch, matching the "validate at write time, rely on
   the DB for atomic rollback" pattern of this codebase's other guards.
   department_id IS NULL rows aren't constrained (unlinked managerial
   job-positions don't conflict with each other — Postgres unique indexes
   already treat each NULL as distinct, so no explicit WHERE clause
   exclusion is even needed for that half).

2. `action_plans`: at most one OPEN (status IN ('defined','in_progress'),
   not soft-deleted) plan per (worker_id, skill_id) — a worker can
   accumulate any number of RESOLVED historical plans for the same skill
   (that's the audit trail LUK_2 was built for), only one may be actively
   in flight. routes/workers/routes.py's create/update handlers and
   services/action_plan_service.py's training branch all pre-check this
   the same way.

Neither guard could be expressed this way for medical_exams/bhp_trainings'
analogous "at most one currently-valid row per (worker, kind)" rule — that
predicate needs `valid_until >= CURRENT_DATE`, and Postgres rejects
non-IMMUTABLE functions in an index predicate. Those two are enforced
purely at the repository layer (MedicalExamRepository/BhpTrainingRepository
create/update) — see their own docstrings.

Dev DB checked clean before writing this (zero existing violators for
either rule), so no dedup step is needed.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_one_manager_per_department
        ON jobs (department_id)
        WHERE is_managerial = TRUE AND department_id IS NOT NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_action_plans_one_open_per_worker_skill
        ON action_plans (worker_id, skill_id)
        WHERE NOT is_deleted AND status IN ('defined', 'in_progress')
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_action_plans_one_open_per_worker_skill")
    op.execute("DROP INDEX IF EXISTS idx_jobs_one_manager_per_department")
