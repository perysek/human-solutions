"""Create alert_thresholds table (Staamp HR domain, Phase 6)

Revision ID: 9c1d2e3f4a5b
Revises: 7e2feddd7715
Create Date: 2026-08-20

IMPLEMENTATION_PLAN.md §11 (DSH_5). One row per alerting module
(medical/bhp/foreigner_docs), holding the same critical/warning/notice
day-counts that services/alert_service.py has, until now, held as hard
constants (CRITICAL_DAYS/WARNING_DAYS/NOTICE_DAYS = 30/60/90). Column
DEFAULTs match those constants exactly (OQ_1, IMPLEMENTATION_PLAN.md §15),
so the seed INSERT below needs no explicit values — every module starts
at the same 30/60/90 the app already used pre-Phase-6.

`foreigner_docs` gets a `notice_days` column too even though its own alert
panel (DSH_4) only ever reads critical/warning — see OQ_1's "bez 90"
remark. Giving every module the same three columns keeps the DSH_5 admin
table uniform; the unused third value for that one module is inert, not a
schema inconsistency to special-case.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = '9c1d2e3f4a5b'
down_revision: Union[str, None] = '7e2feddd7715'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'alert_thresholds',
        sa.Column('module', sa.Text(), nullable=False),
        sa.Column('warning_days', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('critical_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('notice_days', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.current_timestamp()),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('module'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint("module IN ('medical', 'bhp', 'foreigner_docs')", name='check_alert_thresholds_module'),
    )
    op.execute(
        "INSERT INTO alert_thresholds (module) VALUES ('medical'), ('bhp'), ('foreigner_docs') "
        "ON CONFLICT DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table('alert_thresholds')
