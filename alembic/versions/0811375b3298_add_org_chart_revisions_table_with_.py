"""Add org_chart_revisions table with structural-change triggers

Revision ID: 0811375b3298
Revises: 8f053c175547
Create Date: 2026-08-31

Product need: an auto-incrementing revision number + timestamp for the org
chart (departments.parent_department_id tree + jobs.is_managerial/
is_director, migration 8f053c175547), bumped whenever the STRUCTURE changes —
not whenever a worker is hired/fired/reassigned. Exact trigger set, as
specified:
  - departments: INSERT, DELETE, or parent_department_id changing
  - jobs: is_managerial changing, is_director changing, department_id
    changing, or DELETE of a job that WAS managerial or director
  - jobs INSERT is deliberately excluded (explicit product decision — a
    fresh, unflagged job-position doesn't change the chart's shape)
  - workers: nothing at all, on purpose — hiring/firing/reassigning a person
    never touches this table

`org_chart_revisions` is append-only, `id` (SERIAL) doubling as the revision
number itself rather than a separate counter column — this table's whole job
is being the log, so a second "revision_number" column would just duplicate
`id` 1:1 forever (nothing ever deletes a row here). `revised_at` for when,
`trigger_source` (e.g. 'departments:5:UPDATE:parent_department_id',
'jobs:BRYGADZISTA:DELETE') for what changed, so a future UI can show not just
that the chart moved but why.

Real Postgres triggers, not repository-layer `_audit()` calls like the rest
of this codebase's non-declarative rules (see d1e2f3a4b5c6's precedent) —
deliberate exception. `JobRepository.update()`'s own docstring already
documents that is_managerial/is_director/department_id changes made through
the normal edit path are NOT captured by `_audit()` today ("secondary to
description") — i.e. relying on a human remembering to call a Python-side
bump for exactly these fields has already been shown, in this codebase, to
have a gap. A trigger attached to the table itself fires regardless of which
code path — or future script — writes the row.

The function body compares OLD/NEW per-field with `IS DISTINCT FROM`
(NULL-safe) to build a readable trigger_source; `UPDATE OF <cols>` on the
CREATE TRIGGER itself restricts firing to writes that actually list those
columns in SET, so `departments.name`/`description` edits and
`jobs.description` edits (audited separately, unrelated to chart shape)
never touch this trigger. jobs gets two single-purpose triggers (UPDATE,
DELETE) rather than one combined one — see the inline comment above the
DELETE trigger for why.
"""
from typing import Sequence, Union

from alembic import op

revision: str = '0811375b3298'
down_revision: Union[str, None] = '8f053c175547'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE org_chart_revisions (
            id SERIAL PRIMARY KEY,
            revised_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            trigger_source TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION bump_org_chart_revision() RETURNS TRIGGER AS $$
        DECLARE
            row_id TEXT;
            detail TEXT := '';
        BEGIN
            row_id := COALESCE(NEW.id::TEXT, OLD.id::TEXT);

            IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'departments' THEN
                detail := 'parent_department_id';
            ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'jobs' THEN
                IF NEW.is_managerial IS DISTINCT FROM OLD.is_managerial THEN
                    detail := detail || 'is_managerial;';
                END IF;
                IF NEW.is_director IS DISTINCT FROM OLD.is_director THEN
                    detail := detail || 'is_director;';
                END IF;
                IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
                    detail := detail || 'department_id;';
                END IF;
            END IF;

            INSERT INTO org_chart_revisions (trigger_source)
            VALUES (
                TG_TABLE_NAME || ':' || row_id || ':' || TG_OP ||
                CASE WHEN detail <> '' THEN ':' || detail ELSE '' END
            );
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER trg_departments_org_chart_revision
        AFTER INSERT OR DELETE OR UPDATE OF parent_department_id ON departments
        FOR EACH ROW
        EXECUTE FUNCTION bump_org_chart_revision()
    """)

    # Two single-purpose triggers rather than one combined DELETE-OR-UPDATE
    # trigger: a CREATE TRIGGER ... WHEN clause is a plain SQL boolean
    # expression over OLD/NEW only — TG_OP is a PL/pgSQL variable that only
    # exists once execution is inside the trigger FUNCTION body, not in the
    # WHEN clause evaluated ahead of it. Scoping each trigger to one event
    # sidesteps needing TG_OP in a WHEN at all.
    op.execute("""
        CREATE TRIGGER trg_jobs_org_chart_revision_update
        AFTER UPDATE OF is_managerial, is_director, department_id ON jobs
        FOR EACH ROW
        EXECUTE FUNCTION bump_org_chart_revision()
    """)

    op.execute("""
        CREATE TRIGGER trg_jobs_org_chart_revision_delete
        AFTER DELETE ON jobs
        FOR EACH ROW
        WHEN (OLD.is_managerial OR OLD.is_director)
        EXECUTE FUNCTION bump_org_chart_revision()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_jobs_org_chart_revision_delete ON jobs")
    op.execute("DROP TRIGGER IF EXISTS trg_jobs_org_chart_revision_update ON jobs")
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision ON departments")
    op.execute("DROP FUNCTION IF EXISTS bump_org_chart_revision()")
    op.execute("DROP TABLE IF EXISTS org_chart_revisions")
