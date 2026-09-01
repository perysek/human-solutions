"""Remove org-chart auto-revision triggers, add manual revision support

Revision ID: d6d10b667838
Revises: cab974083e2c
Create Date: 2026-09-01

Product change: revisions were auto-created by a DB trigger on every single
structural write (migrations 0811375b3298, cab974083e2c) — one field edit =
one revision, no way to batch a multi-step reorganisation into one
deliberate revision. Moving to user-controlled batching: the user reviews
every structural change pending since the last revision (in a UI modal) and
explicitly creates a new revision covering all of them at once.

Drops the trigger + function entirely — `departments`/`jobs` structural
edits are no longer detected via a DB-side side effect. Instead
`JobRepository`/`DepartmentRepository`'s existing `AuditableMixin._audit()`
calls (this codebase's normal, non-declarative audit mechanism — see
`repositories/auditable.py`) become the source of truth for "what changed",
same `audit_log` table already used for every other entity's forensic
trail. `org_chart_revisions` becomes an application-written table (no
longer trigger-only): `created_by_user_id`/`created_by_user_name` record
who committed the batch. `trigger_source` is renamed `summary` — it no
longer holds a raw trigger fingerprint, it holds a human-written/generated
summary of a batch that can now span many audit_log rows, so the old name
would actively mislead. Nullable, since existing rows (written by the old
trigger, one-liner `trigger_source` values) are backfilled by the rename
rather than re-derived.

`org_chart_revision_changes` is the new join table recording exactly which
`audit_log` rows got folded into which revision — `UNIQUE(audit_log_id)`
guarantees one structural change can never be claimed by two revisions
(the "already included, so no longer pending" check the pending-changes
query relies on).

**Historical backfill, found by actually running this against dev data**:
`DepartmentRepository.update()`/`.create()`/`.delete()` have audited
`parent_department_id`/CREATE/DELETE via `_audit()` since this feature was
first built — entirely independently of the trigger, with no link between
"this audit_log row" and "the org_chart_revisions row the trigger wrote for
the same event" (there was never a join table before this migration). If
`upgrade()` stopped at just creating `org_chart_revision_changes` empty,
every department CREATE/DELETE/parent-change ever audited would suddenly
read as "pending" the moment the trigger goes away — weeks of already-
settled history, all showing up as one giant backlog in the new UI. So
`upgrade()` also folds every currently-existing structural `audit_log` row
into one synthetic "cutover" revision, closing out history as of this
migration — `list_pending_changes()` starts genuinely empty right after.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd6d10b667838'
down_revision: Union[str, None] = 'cab974083e2c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- drop the auto-revision triggers + function ---
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision_insert ON departments")
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision_delete ON departments")
    op.execute("DROP TRIGGER IF EXISTS trg_departments_org_chart_revision_update ON departments")
    op.execute("DROP TRIGGER IF EXISTS trg_jobs_org_chart_revision_update ON jobs")
    op.execute("DROP TRIGGER IF EXISTS trg_jobs_org_chart_revision_delete ON jobs")
    op.execute("DROP FUNCTION IF EXISTS bump_org_chart_revision()")

    # --- org_chart_revisions: application-written now, not trigger-only ---
    op.add_column('org_chart_revisions', sa.Column('created_by_user_id', sa.Integer(), nullable=True))
    op.add_column('org_chart_revisions', sa.Column('created_by_user_name', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_org_chart_revisions_created_by_user_id',
        'org_chart_revisions', 'users',
        ['created_by_user_id'], ['id'],
    )
    op.alter_column('org_chart_revisions', 'trigger_source', new_column_name='summary')
    op.alter_column('org_chart_revisions', 'summary', nullable=True)

    # --- join table: which audit_log rows a revision folded in ---
    op.execute("""
        CREATE TABLE org_chart_revision_changes (
            id SERIAL PRIMARY KEY,
            revision_id INT NOT NULL REFERENCES org_chart_revisions(id) ON DELETE CASCADE,
            audit_log_id INT NOT NULL REFERENCES audit_log(id) ON DELETE CASCADE,
            UNIQUE (audit_log_id)
        )
    """)
    op.execute(
        "CREATE INDEX idx_org_chart_revision_changes_revision_id "
        "ON org_chart_revision_changes (revision_id)"
    )

    # --- historical cutover: fold every pre-existing structural audit_log
    # row into one synthetic revision, so list_pending_changes() starts
    # empty right after this migration instead of surfacing weeks of
    # already-settled history. Whitelist mirrors
    # OrgChartRevisionRepository._PENDING_CHANGES_WHERE exactly (frozen here
    # as a literal, same as the rest of this migration, so this step's
    # meaning doesn't silently drift if that Python whitelist changes later).
    op.execute("""
        DO $$
        DECLARE
            cutover_id INT;
        BEGIN
            IF EXISTS (
                SELECT 1 FROM audit_log a
                WHERE (
                    (a.entity_type = 'department' AND a.action IN ('CREATE', 'DELETE'))
                    OR (a.entity_type = 'department' AND a.action = 'UPDATE' AND a.field_name = 'parent_department_id')
                    OR (a.entity_type = 'job' AND a.action = 'UPDATE' AND a.field_name IN ('is_managerial', 'is_director', 'department_id'))
                    OR (a.entity_type = 'job' AND a.action = 'DELETE' AND a.field_name = 'org_chart_structural_delete')
                )
            ) THEN
                INSERT INTO org_chart_revisions (summary)
                VALUES ('Migracja na ręczne rewizje — zamknięcie historii sprzed tej daty')
                RETURNING id INTO cutover_id;

                INSERT INTO org_chart_revision_changes (revision_id, audit_log_id)
                SELECT cutover_id, a.id FROM audit_log a
                WHERE (
                    (a.entity_type = 'department' AND a.action IN ('CREATE', 'DELETE'))
                    OR (a.entity_type = 'department' AND a.action = 'UPDATE' AND a.field_name = 'parent_department_id')
                    OR (a.entity_type = 'job' AND a.action = 'UPDATE' AND a.field_name IN ('is_managerial', 'is_director', 'department_id'))
                    OR (a.entity_type = 'job' AND a.action = 'DELETE' AND a.field_name = 'org_chart_structural_delete')
                );
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_org_chart_revision_changes_revision_id")
    op.execute("DROP TABLE IF EXISTS org_chart_revision_changes")

    op.execute("UPDATE org_chart_revisions SET summary = '' WHERE summary IS NULL")
    op.alter_column('org_chart_revisions', 'summary', nullable=False)
    op.alter_column('org_chart_revisions', 'summary', new_column_name='trigger_source')
    op.drop_constraint('fk_org_chart_revisions_created_by_user_id', 'org_chart_revisions', type_='foreignkey')
    op.drop_column('org_chart_revisions', 'created_by_user_name')
    op.drop_column('org_chart_revisions', 'created_by_user_id')

    # Restore migration 0811375b3298 + cab974083e2c's exact final shape.
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
    op.execute("""
        CREATE TRIGGER trg_jobs_org_chart_revision_delete
        AFTER DELETE ON jobs
        FOR EACH ROW
        WHEN (OLD.is_managerial OR OLD.is_director)
        EXECUTE FUNCTION bump_org_chart_revision()
    """)
