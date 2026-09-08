"""Add 'absences' module to role_permissions

Revision ID: ab01absc0003
Revises: ab01absc0002
Create Date: 2026-09-08

Every role gets at least own_data access — everyone (including 'viewer') is
a worker who may need to submit/view/cancel their OWN absence requests.
Approval capability (seeing and acting on someone else's request) is NOT a
role grant here — it comes from worker_absence_approvers, checked in
routes/absences/routes.py's absence_management_required, independent of
role. superadmin/hr_manager additionally get unrestricted (own_data=False)
access, matching their access to every other worker-data module.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'ab01absc0003'
down_revision: Union[str, None] = 'ab01absc0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# role_name -> (has_access, read_only, own_data)
ABSENCES_PERMISSIONS = {
    'superadmin': (True, False, False),
    'hr_manager': (True, False, False),
    'trainer':    (True, False, True),
    'viewer':     (True, False, True),
}


def upgrade() -> None:
    conn = op.get_bind()
    for role_name, (has_access, read_only, own_data) in ABSENCES_PERMISSIONS.items():
        role_id = conn.execute(
            sa.text("SELECT id FROM roles WHERE name = :name"), {'name': role_name}
        ).scalar_one_or_none()
        if role_id is None:
            continue  # role doesn't exist on this DB (e.g. a custom role set) — skip, not fatal
        conn.execute(
            sa.text(
                "INSERT INTO role_permissions (role_id, module_name, has_access, read_only, own_data) "
                "VALUES (:role_id, 'absences', :has_access, :read_only, :own_data) "
                "ON CONFLICT (role_id, module_name) DO UPDATE SET "
                "has_access = EXCLUDED.has_access, read_only = EXCLUDED.read_only, own_data = EXCLUDED.own_data"
            ),
            {'role_id': role_id, 'has_access': has_access, 'read_only': read_only, 'own_data': own_data},
        )


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE module_name = 'absences'")
