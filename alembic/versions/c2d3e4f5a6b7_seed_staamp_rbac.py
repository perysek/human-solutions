"""Replace the salon RBAC seed with the Staamp HR domain's roles/modules

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-08-18

Data migration (IMPLEMENTATION_PLAN.md §5.1). The five salon roles
(superuser/admin/receptionist/stylist/accountant) and their module grants
are replaced with the four Staamp HR roles (superadmin/hr_manager/trainer/
viewer) against the new 9-module list (workers/jobs/medical/bhp/skills/
trainings/dashboard/audit/admin).

``role_permissions.role_id`` has ``ON DELETE CASCADE`` (database/schema.sql),
so deleting the old roles cascades their grants automatically — no separate
DELETE against role_permissions is needed.

``users.role`` is a plain TEXT column (no FK to roles.name — confirmed by
grep across alembic/versions/), so deleting the old role rows does not
touch any existing user account. This build ships with no real users
(only salon dev-seed accounts under @myway.local — see
scripts/seed_dev_data.py), but the safety UPDATE below re-maps any
lingering old-role account onto its nearest Staamp equivalent rather than
silently leaving it permission-less, in case this ever runs against a
database that gained real users before this migration lands.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_ROLES = ['superuser', 'admin', 'receptionist', 'stylist', 'accountant']

NEW_ROLES = [
    # (name, display_name, is_protected)
    ('superadmin', 'Administrator systemu', True),
    ('hr_manager', 'Kierownik HR', False),
    ('trainer', 'Trener', False),
    ('viewer', 'Obserwator', False),
]

ROLE_REMAP = {
    'superuser': 'superadmin',
    'admin': 'hr_manager',
    'receptionist': 'viewer',
    'stylist': 'viewer',
    'accountant': 'viewer',
}

ALL_MODULES = ['workers', 'jobs', 'medical', 'bhp', 'skills', 'trainings', 'dashboard', 'audit', 'admin']

# role_name -> {module_name: (has_access, read_only, own_data)}
PERMISSION_MATRIX = {
    'superadmin': {m: (True, False, False) for m in ALL_MODULES},
    'hr_manager': {
        'workers': (True, False, False),
        'jobs': (True, False, False),
        'medical': (True, False, False),
        'bhp': (True, False, False),
        'skills': (True, False, False),
        'trainings': (True, False, False),
        'dashboard': (True, False, False),
        'audit': (True, True, False),
        'admin': (False, False, False),
    },
    'trainer': {
        m: (False, False, False) for m in ALL_MODULES
    },
    'viewer': {
        m: (False, False, False) for m in ALL_MODULES
    },
}
PERMISSION_MATRIX['trainer']['trainings'] = (True, False, True)
PERMISSION_MATRIX['trainer']['dashboard'] = (True, False, True)
PERMISSION_MATRIX['viewer']['trainings'] = (True, True, False)


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Re-map any existing user still on an old role name (see module docstring).
    for old_role, new_role in ROLE_REMAP.items():
        conn.execute(
            sa.text("UPDATE users SET role = :new_role WHERE role = :old_role"),
            {'new_role': new_role, 'old_role': old_role},
        )

    # 2. Drop the salon roles — cascades their role_permissions rows.
    conn.execute(
        sa.text("DELETE FROM roles WHERE name = ANY(:names)"),
        {'names': OLD_ROLES},
    )

    # 3. Seed the Staamp roles.
    for name, display_name, is_protected in NEW_ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO roles (name, display_name, is_protected) "
                "VALUES (:name, :display_name, :is_protected) "
                "ON CONFLICT (name) DO NOTHING"
            ),
            {'name': name, 'display_name': display_name, 'is_protected': is_protected},
        )

    # 4. Seed role_permissions per the matrix (IMPLEMENTATION_PLAN.md §5.1).
    for role_name, modules in PERMISSION_MATRIX.items():
        role_id = conn.execute(
            sa.text("SELECT id FROM roles WHERE name = :name"), {'name': role_name}
        ).scalar_one()
        for module_name, (has_access, read_only, own_data) in modules.items():
            conn.execute(
                sa.text(
                    "INSERT INTO role_permissions (role_id, module_name, has_access, read_only, own_data) "
                    "VALUES (:role_id, :module_name, :has_access, :read_only, :own_data) "
                    "ON CONFLICT (role_id, module_name) DO UPDATE SET "
                    "has_access = EXCLUDED.has_access, read_only = EXCLUDED.read_only, own_data = EXCLUDED.own_data"
                ),
                {
                    'role_id': role_id,
                    'module_name': module_name,
                    'has_access': has_access,
                    'read_only': read_only,
                    'own_data': own_data,
                },
            )


def downgrade() -> None:
    """Best-effort reversal: restores the salon roles/permissions from
    database/schema.sql's original seed and drops the Staamp roles. Any user
    re-mapped by upgrade()'s safety UPDATE keeps its Staamp role name (the
    remap is not reversible without knowing which accounts were touched) —
    acceptable because this migration only ever ships to a database whose
    salon roles were about to be permanently retired anyway.
    """
    conn = op.get_bind()

    conn.execute(sa.text("DELETE FROM roles WHERE name = ANY(:names)"), {'names': [n for n, _, _ in NEW_ROLES]})

    legacy_roles = [
        ('superuser', 'Właściciel', True),
        ('admin', 'Administrator', False),
        ('receptionist', 'Recepcjonista', False),
        ('stylist', 'Stylista', False),
        ('accountant', 'Księgowy', False),
    ]
    for name, display_name, is_protected in legacy_roles:
        conn.execute(
            sa.text(
                "INSERT INTO roles (name, display_name, is_protected) "
                "VALUES (:name, :display_name, :is_protected) "
                "ON CONFLICT (name) DO NOTHING"
            ),
            {'name': name, 'display_name': display_name, 'is_protected': is_protected},
        )
