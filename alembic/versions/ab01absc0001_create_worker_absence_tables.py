"""Create worker absence management tables (categories, approvers, absences)

Revision ID: ab01absc0001
Revises: d6d10b667838
Create Date: 2026-09-08

Ports the golden-standard absence engine (faktura_scanner_flask branch
invoices-app: absence_categories / employee_supervisors / employee_absences)
onto this app's TEXT worker id and drops the appointment-conflict machinery,
which is salon-specific (client scheduling doesn't exist in this domain).

Introduces:
  - worker_absence_categories : lookup table for absence types (vacation, L4,
                                 home office, ...), each independently toggle-
                                 configurable (see next migration for the
                                 balance-tracking columns added to it)
  - worker_absence_approvers  : many-to-many worker -> approver mapping. Not
                                 derived from the org chart's "boss" label
                                 (workers.boss_id was already dropped —
                                 "przełożony" there is a derived, possibly
                                 multi-valued display field, not fit for a
                                 deterministic one-request-one-approver
                                 workflow). HR assigns this explicitly.
  - worker_absences           : the request / manual absence record itself
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'ab01absc0001'
down_revision: Union[str, None] = 'd6d10b667838'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── worker_absence_categories ─────────────────────────────────────────────
    op.create_table(
        'worker_absence_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('absence_full_day', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='FALSE'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_worker_absence_categories_name'),
    )
    op.create_index('idx_worker_absence_categories_is_deleted', 'worker_absence_categories', ['is_deleted'])

    # Seed set — every type is just a category row; "customizable" means HR can
    # add/edit/retire more from the settings UI (Phase 6), nothing hardcoded
    # beyond this starting set.
    op.execute("""
        INSERT INTO worker_absence_categories (name, description, absence_full_day) VALUES
        ('Urlop wypoczynkowy', 'Coroczny urlop wypoczynkowy', TRUE),
        ('Urlop na żądanie', 'Urlop na żądanie', TRUE),
        ('Zwolnienie lekarskie (L4)', 'Zwolnienie lekarskie', TRUE),
        ('Home office', 'Praca zdalna', TRUE),
        ('Urlop macierzyński/rodzicielski', 'Urlop macierzyński lub rodzicielski', TRUE),
        ('Wyjście prywatne', 'Krótkie wyjście prywatne w trakcie dnia pracy', FALSE)
    """)

    # ── worker_absence_approvers ──────────────────────────────────────────────
    op.create_table(
        'worker_absence_approvers',
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('approver_worker_id', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('worker_id', 'approver_worker_id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['approver_worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.CheckConstraint('worker_id != approver_worker_id', name='check_no_self_approval'),
    )
    op.create_index('idx_absence_approvers_worker', 'worker_absence_approvers', ['worker_id'])
    op.create_index('idx_absence_approvers_approver', 'worker_absence_approvers', ['approver_worker_id'])

    # ── worker_absences ───────────────────────────────────────────────────────
    op.create_table(
        'worker_absences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('date_from', sa.Date(), nullable=False),
        sa.Column('date_to', sa.Date(), nullable=False),  # = date_from for time-slot absences
        sa.Column('time_from', sa.Time(), nullable=True),
        sa.Column('time_to', sa.Time(), nullable=True),
        sa.Column('approver_worker_id', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('source', sa.String(20), nullable=False, server_default='request'),  # request | manual
        sa.Column('requested_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),  # users.id
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='FALSE'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['category_id'], ['worker_absence_categories.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['approver_worker_id'], ['workers.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected', 'cancelled')",
                           name='check_worker_absence_status'),
        sa.CheckConstraint("source IN ('request', 'manual')", name='check_worker_absence_source'),
        sa.CheckConstraint('date_to >= date_from', name='check_worker_absence_date_order'),
        sa.CheckConstraint(
            '(time_from IS NULL AND time_to IS NULL) OR '
            '(time_from IS NOT NULL AND time_to IS NOT NULL AND time_to > time_from)',
            name='check_worker_absence_time_order'),
        sa.CheckConstraint(
            "status != 'rejected' OR rejection_reason IS NOT NULL",
            name='check_worker_absence_rejection_reason_required'),
    )
    op.create_index('idx_worker_absences_worker_dates', 'worker_absences', ['worker_id', 'date_from', 'date_to'])
    op.create_index('idx_worker_absences_status', 'worker_absences', ['status'])
    op.create_index('idx_worker_absences_approver', 'worker_absences', ['approver_worker_id'])
    op.create_index('idx_worker_absences_is_deleted', 'worker_absences', ['is_deleted'])


def downgrade() -> None:
    op.drop_index('idx_worker_absences_is_deleted', table_name='worker_absences')
    op.drop_index('idx_worker_absences_approver', table_name='worker_absences')
    op.drop_index('idx_worker_absences_status', table_name='worker_absences')
    op.drop_index('idx_worker_absences_worker_dates', table_name='worker_absences')
    op.drop_table('worker_absences')

    op.drop_index('idx_absence_approvers_approver', table_name='worker_absence_approvers')
    op.drop_index('idx_absence_approvers_worker', table_name='worker_absence_approvers')
    op.drop_table('worker_absence_approvers')

    op.drop_index('idx_worker_absence_categories_is_deleted', table_name='worker_absence_categories')
    op.drop_table('worker_absence_categories')
