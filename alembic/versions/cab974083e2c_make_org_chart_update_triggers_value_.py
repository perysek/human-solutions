"""make org chart update triggers value-aware

Revision ID: cab974083e2c
Revises: 0811375b3298
Create Date: 2026-09-01 02:52:46.255658

Bug found while wiring TASK3 (org-structure toast notifications,
ORG_CHART_PROPOSAL.md follow-up): `UPDATE OF <cols>` on a Postgres trigger
fires whenever an UPDATE statement's SET clause NAMES those columns — not
only when their VALUE actually changes. Both `DepartmentRepository.update()`
and `JobRepository.update()` always write their full column set on every
save (this codebase's normal "always write everything" repository pattern —
see e.g. JobRepository.update()'s own docstring), so a department's
name/description-only edit, or a job's description-only edit, ALSO lists
`parent_department_id` / `is_managerial, is_director, department_id` in its
SET clause even though those values are unchanged — and the trigger from
migration 0811375b3298 fires anyway. Confirmed empirically: a no-op job save
(identical is_managerial/is_director/department_id) still inserted an
org_chart_revisions row.

That directly contradicts 0811375b3298's own documented intent ("jobs.
description edits ... never touch this trigger") and would flood both the
revision-history table (§4f) and TASK3's toast with false "structure
changed" entries on every plain description edit — worse than not building
TASK3 at all.

Fix: add a value-aware `WHEN` clause (`IS DISTINCT FROM`, NULL-safe) that
compares OLD/NEW so the trigger only actually fires when a listed column's
value changed, not merely appeared in SET. `bump_org_chart_revision()` itself
needs no change — its per-field `detail` string is already built the same
way; only the trigger-level gating was wrong.

For `jobs`, this only touches the existing UPDATE trigger — the DELETE
trigger already gates correctly on `OLD` alone (`WHEN (OLD.is_managerial OR
OLD.is_director)`), which was always safe since DELETE always has an `OLD`
row.

For `departments`, the ORIGINAL trigger combined INSERT OR DELETE OR
UPDATE OF parent_department_id into ONE trigger — but a single WHEN
expression can't safely cover all three: DELETE has no `NEW` row and
INSERT has no `OLD` row, so a naive `NEW.x IS DISTINCT FROM OLD.x` clause
would wrongly suppress a top-level department's own DELETE (a NULL
parent_department_id on both sides reads as "unchanged"). Splitting into
three single-purpose triggers — mirroring the split this migration's
predecessor already used for `jobs` UPDATE vs. DELETE, and for the exact
same reason (TG_OP isn't available in a WHEN clause, only inside the
trigger FUNCTION body) — makes each WHEN condition trivially correct:
INSERT/DELETE need none at all (every INSERT/DELETE of a department is
structural by definition), only the UPDATE trigger needs the OLD/NEW
comparison, and only ever sees rows where both sides exist.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'cab974083e2c'
down_revision: Union[str, None] = '0811375b3298'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- departments: split the combined trigger into three single-purpose ones ---
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision ON departments")

    op.execute("""
        CREATE TRIGGER trg_departments_org_chart_revision_insert
        AFTER INSERT ON departments
        FOR EACH ROW
        EXECUTE FUNCTION bump_org_chart_revision()
    """)

    op.execute("""
        CREATE TRIGGER trg_departments_org_chart_revision_delete
        AFTER DELETE ON departments
        FOR EACH ROW
        EXECUTE FUNCTION bump_org_chart_revision()
    """)

    op.execute("""
        CREATE TRIGGER trg_departments_org_chart_revision_update
        AFTER UPDATE OF parent_department_id ON departments
        FOR EACH ROW
        WHEN (NEW.parent_department_id IS DISTINCT FROM OLD.parent_department_id)
        EXECUTE FUNCTION bump_org_chart_revision()
    """)

    # --- jobs: re-create only the UPDATE trigger with a value-aware WHEN ---
    op.execute("DROP TRIGGER IF EXISTS trg_jobs_org_chart_revision_update ON jobs")

    op.execute("""
        CREATE TRIGGER trg_jobs_org_chart_revision_update
        AFTER UPDATE OF is_managerial, is_director, department_id ON jobs
        FOR EACH ROW
        WHEN (
            NEW.is_managerial IS DISTINCT FROM OLD.is_managerial
            OR NEW.is_director IS DISTINCT FROM OLD.is_director
            OR NEW.department_id IS DISTINCT FROM OLD.department_id
        )
        EXECUTE FUNCTION bump_org_chart_revision()
    """)
    # trg_jobs_org_chart_revision_delete is untouched — already correct.


def downgrade() -> None:
    # Restore migration 0811375b3298's exact original shape.
    op.execute("DROP TRIGGER IF EXISTS trg_jobs_org_chart_revision_update ON jobs")
    op.execute("""
        CREATE TRIGGER trg_jobs_org_chart_revision_update
        AFTER UPDATE OF is_managerial, is_director, department_id ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION bump_org_chart_revision()
    """)

    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision_update ON departments")
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision_delete ON departments")
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision_insert ON departments")
    op.execute("""
        CREATE TRIGGER trg_departments_org_chart_revision
        AFTER INSERT OR DELETE OR UPDATE OF parent_department_id ON departments
        FOR EACH ROW
        EXECUTE FUNCTION bump_org_chart_revision()
    """)
