"""Add balance-tracking columns/tables for worker absences

Revision ID: ab01absc0002
Revises: ab01absc0001
Create Date: 2026-09-08

Introduces:
  - New columns on worker_absence_categories: is_tracked, count_period,
    resets_at, rolling_days, warning_threshold_pct, default_max_value —
    the per-category toggle set the settings UI (Phase 6) exposes as
    switches. A category with is_tracked=FALSE (e.g. L4, maternity leave)
    is purely informational: no limit is ever enforced against it.
  - worker_absence_limits             : per-worker override of a category's
                                         default_max_value
  - worker_absence_balance_adjustments: manual balance corrections
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'ab01absc0002'
down_revision: Union[str, None] = 'ab01absc0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('worker_absence_categories',
        sa.Column('is_tracked', sa.Boolean(), nullable=False, server_default='FALSE'))
    op.add_column('worker_absence_categories',
        sa.Column('count_period', sa.String(20), nullable=False, server_default='yearly'))
    op.add_column('worker_absence_categories',
        sa.Column('resets_at', sa.Integer(), nullable=True, server_default='1'))
    op.add_column('worker_absence_categories',
        sa.Column('rolling_days', sa.Integer(), nullable=True))
    op.add_column('worker_absence_categories',
        sa.Column('warning_threshold_pct', sa.Float(), nullable=False, server_default='0.80'))
    op.add_column('worker_absence_categories',
        sa.Column('default_max_value', sa.Float(), nullable=False, server_default='0.0'))

    op.create_check_constraint(
        'chk_worker_absence_count_period', 'worker_absence_categories',
        "count_period IN ('yearly', 'monthly', 'rolling')")
    op.create_check_constraint(
        'chk_worker_absence_resets_at', 'worker_absence_categories',
        'resets_at IS NULL OR (resets_at >= 1 AND resets_at <= 365)')
    op.create_check_constraint(
        'chk_worker_absence_warning_threshold', 'worker_absence_categories',
        'warning_threshold_pct >= 0.0 AND warning_threshold_pct <= 1.0')
    op.create_check_constraint(
        'chk_worker_absence_default_max_value', 'worker_absence_categories',
        'default_max_value >= 0.0')
    op.create_check_constraint(
        'chk_worker_absence_rolling_days', 'worker_absence_categories',
        'rolling_days IS NULL OR rolling_days > 0')

    op.execute("""
        UPDATE worker_absence_categories
        SET is_tracked = TRUE, count_period = 'yearly', resets_at = 1,
            default_max_value = 26.0, warning_threshold_pct = 0.80
        WHERE name = 'Urlop wypoczynkowy'
    """)
    op.execute("""
        UPDATE worker_absence_categories
        SET is_tracked = TRUE, count_period = 'yearly', resets_at = 1,
            default_max_value = 4.0, warning_threshold_pct = 0.80
        WHERE name = 'Urlop na żądanie'
    """)
    op.execute("""
        UPDATE worker_absence_categories
        SET is_tracked = TRUE, count_period = 'monthly', resets_at = 1,
            default_max_value = 8.0, warning_threshold_pct = 0.75
        WHERE name = 'Home office'
    """)
    op.execute("""
        UPDATE worker_absence_categories
        SET is_tracked = TRUE, count_period = 'monthly', resets_at = 1,
            default_max_value = 16.0, warning_threshold_pct = 0.75
        WHERE name = 'Wyjście prywatne'
    """)
    # L4 and maternity/parental leave stay is_tracked=FALSE (statutory,
    # informational — no cap enforced), matching the golden standard's
    # treatment of sick leave.

    op.create_table(
        'worker_absence_limits',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('max_value', sa.Float(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='FALSE'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['worker_absence_categories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint('max_value >= 0.0', name='chk_worker_absence_limit_max_value'),
    )
    op.create_index(
        'uq_worker_absence_limits_active', 'worker_absence_limits',
        ['worker_id', 'category_id'], unique=True,
        postgresql_where=sa.text('is_deleted = FALSE'),
    )
    op.create_index('idx_worker_absence_limits_worker', 'worker_absence_limits', ['worker_id'])
    op.create_index('idx_worker_absence_limits_category', 'worker_absence_limits', ['category_id'])

    op.create_table(
        'worker_absence_balance_adjustments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('worker_id', sa.Text(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('delta_value', sa.Float(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('period_label', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='FALSE'),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['worker_absence_categories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.CheckConstraint("length(trim(reason)) > 0", name='chk_worker_absence_adj_reason_not_empty'),
    )
    op.create_index('idx_worker_absence_adj_worker', 'worker_absence_balance_adjustments', ['worker_id'])
    op.create_index('idx_worker_absence_adj_category', 'worker_absence_balance_adjustments', ['category_id'])
    op.create_index('idx_worker_absence_adj_deleted', 'worker_absence_balance_adjustments', ['is_deleted'])


def downgrade() -> None:
    op.drop_index('idx_worker_absence_adj_deleted', table_name='worker_absence_balance_adjustments')
    op.drop_index('idx_worker_absence_adj_category', table_name='worker_absence_balance_adjustments')
    op.drop_index('idx_worker_absence_adj_worker', table_name='worker_absence_balance_adjustments')
    op.drop_table('worker_absence_balance_adjustments')

    op.drop_index('idx_worker_absence_limits_category', table_name='worker_absence_limits')
    op.drop_index('idx_worker_absence_limits_worker', table_name='worker_absence_limits')
    op.drop_index('uq_worker_absence_limits_active', table_name='worker_absence_limits')
    op.drop_table('worker_absence_limits')

    op.drop_constraint('chk_worker_absence_rolling_days', 'worker_absence_categories', type_='check')
    op.drop_constraint('chk_worker_absence_default_max_value', 'worker_absence_categories', type_='check')
    op.drop_constraint('chk_worker_absence_warning_threshold', 'worker_absence_categories', type_='check')
    op.drop_constraint('chk_worker_absence_resets_at', 'worker_absence_categories', type_='check')
    op.drop_constraint('chk_worker_absence_count_period', 'worker_absence_categories', type_='check')

    op.drop_column('worker_absence_categories', 'default_max_value')
    op.drop_column('worker_absence_categories', 'warning_threshold_pct')
    op.drop_column('worker_absence_categories', 'rolling_days')
    op.drop_column('worker_absence_categories', 'resets_at')
    op.drop_column('worker_absence_categories', 'count_period')
    op.drop_column('worker_absence_categories', 'is_tracked')
