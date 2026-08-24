"""Widen audit_log.entity_id from INTEGER to TEXT

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-08-18

Discovered while wiring up JobRepository/SkillRepository's AuditableMixin
calls (Phase 1): ``audit_log.entity_id`` was typed INTEGER for the invoice
domain's surrogate-key entities. IMPLEMENTATION_PLAN.md's own cross-cutting
decision #1 gives `jobs`/`skills`/`workers` natural TEXT primary keys (e.g.
"BRYGADZISTA") — every `_audit(...)` call for those entities silently failed
(`InvalidTextRepresentation`, swallowed by AuditRepository.safe_log_event
outside a managed_transaction) until this migration widens the column.

Safe, lossless for every existing row: every current ``entity_id`` value is
either NULL or an integer string, and nothing in the codebase does integer
arithmetic on ``entity_id`` — it is always treated as an opaque identifier
compared for equality. ``idx_audit_entity`` (on `entity_type, entity_id`)
survives the type change automatically.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE audit_log ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT")


def downgrade() -> None:
    # Lossy if any TEXT-keyed entity (job/skill/worker) rows exist by then —
    # those entity_id values are not valid integers and this cast will fail,
    # which is the correct, loud behavior rather than silently truncating data.
    op.execute("ALTER TABLE audit_log ALTER COLUMN entity_id TYPE INTEGER USING entity_id::INTEGER")
