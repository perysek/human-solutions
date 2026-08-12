"""
Dev-only seed data.

Trims the 5 built-in roles (schema.sql / 000_baseline migration) down to the
3 this build actually uses, creates 5 users spread across them, and 10 fake
employees (3 linked to user accounts, one supervisor relationship seeded so
the is_supervisor() RBAC override has real data to demonstrate).

Idempotent — re-running skips anything that already exists by email / name.
Refuses to run when FLASK_ENV=production.

Usage:
    python scripts/seed_dev_data.py
"""
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / '.env')
load_dotenv(_BASE_DIR / '.env.local', override=True)

if os.environ.get('FLASK_ENV') == 'production':
    raise SystemExit('Refusing to run the dev seed script with FLASK_ENV=production.')

from app import create_app
from config.database import get_db_connection
from config.auth_config import MODULE_PERMISSIONS
from repositories.roles.role_repository import RoleRepository, ALL_MODULES
from repositories.users.user_repository import UserRepository
from repositories.employees.employee_repository import EmployeeRepository
from database.models import Employee

DEV_PASSWORD = 'DevPass123!'

ROLES_TO_KEEP = ['superuser', 'admin', 'receptionist']

USERS = [
    dict(email='anna.kowalska@myway.local', full_name='Anna Kowalska', role='superuser'),
    dict(email='marek.nowak@myway.local', full_name='Marek Nowak', role='admin'),
    dict(email='piotr.zielinski@myway.local', full_name='Piotr Zieliński', role='admin'),
    dict(email='katarzyna.wisniewska@myway.local', full_name='Katarzyna Wiśniewska', role='receptionist'),
    dict(email='aleksandra.wojcik@myway.local', full_name='Aleksandra Wójcik', role='receptionist'),
]

# (first_name, last_name, position, employment_status, linked user email or None)
EMPLOYEES = [
    ('Anna', 'Kowalska', 'Właścicielka / Manager', 'active', 'anna.kowalska@myway.local'),
    ('Katarzyna', 'Wiśniewska', 'Recepcjonistka', 'active', 'katarzyna.wisniewska@myway.local'),
    ('Aleksandra', 'Wójcik', 'Recepcjonistka', 'active', 'aleksandra.wojcik@myway.local'),
    ('Magdalena', 'Lewandowska', 'Stylistka', 'active', None),
    ('Karolina', 'Dąbrowska', 'Stylistka', 'active', None),
    ('Natalia', 'Kaczmarek', 'Stylistka', 'active', None),
    ('Agnieszka', 'Zawadzka', 'Kosmetyczka', 'active', None),
    ('Monika', 'Szymańska', 'Kosmetyczka', 'on_leave', None),
    ('Ewa', 'Wojciechowska', 'Manicurzystka', 'active', None),
    ('Barbara', 'Krawczyk', 'Fryzjerka', 'terminated', None),
]

# supervisor full name -> [subordinate full names]. Deliberately a
# receptionist (no direct 'absences' module access) so the seeded data
# demonstrates the is_supervisor() override, not just superuser/admin access.
SUPERVISORS = {
    'Katarzyna Wiśniewska': ['Magdalena Lewandowska', 'Karolina Dąbrowska'],
}


def main():
    app = create_app()
    with app.app_context():
        role_repo = RoleRepository()
        user_repo = UserRepository()
        employee_repo = EmployeeRepository()

        print('Trimming roles table to:', ROLES_TO_KEEP)
        for role in role_repo.get_all():
            if role['name'] not in ROLES_TO_KEEP:
                role_repo.delete(role['id'])
                print(f"  removed role '{role['name']}'")

        # schema.sql's own seed grants EVERY role access to EVERY module
        # ("adjust before deployment" per its comment) — narrow that down to
        # what config/auth_config.py's MODULE_PERMISSIONS actually intends,
        # so the RBAC demonstrated by this seed data is the real one, not
        # the wide-open placeholder.
        print('\nSetting per-module permissions from MODULE_PERMISSIONS...')
        for role in role_repo.get_all():
            role_name = role['name']
            permissions = {
                module: {
                    'has_access': role_name in MODULE_PERMISSIONS.get(module, []),
                    'read_only': False,
                    'own_data': False,
                }
                for module in ALL_MODULES
            }
            role_repo.set_permissions(role['id'], permissions)
            granted = [m for m, v in permissions.items() if v['has_access']]
            print(f"  {role_name}: {', '.join(granted) if granted else '(none)'}")

        print('\nSeeding users...')
        user_ids_by_email = {}
        for u in USERS:
            existing = user_repo.get_by_email(u['email'])
            if existing:
                print(f"  {u['email']} already exists, skipping")
                user_ids_by_email[u['email']] = existing.id
                continue
            uid = user_repo.create_user(
                email=u['email'], password=DEV_PASSWORD,
                full_name=u['full_name'], role=u['role'],
            )
            user_ids_by_email[u['email']] = uid
            print(f"  created {u['email']} ({u['role']})")

        print('\nSeeding employees...')
        employee_ids_by_name = {}
        conn = get_db_connection()
        cursor = conn.cursor()
        for first, last, position, status, linked_email in EMPLOYEES:
            cursor.execute(
                "SELECT id FROM employees WHERE first_name = %s AND last_name = %s",
                (first, last),
            )
            row = cursor.fetchone()
            if row:
                employee_ids_by_name[f'{first} {last}'] = row['id']
                print(f"  {first} {last} already exists, skipping")
                continue

            user_id = user_ids_by_email.get(linked_email) if linked_email else None
            # is_active is the soft-delete flag (set FALSE only by the delete
            # action) — deliberately NOT tied to employment_status here.
            # 'terminated' is a real, visible status (an ex-employee whose
            # record staff still need to see), not a deletion.
            employee = Employee(
                first_name=first, last_name=last, position=position,
                employment_status=status, is_active=True,
                hire_date=date(2024, 1, 15), user_id=user_id,
                email=f'{first.lower()}.{last.lower()}@myway.local',
            )
            eid = employee_repo.create(employee)
            employee_ids_by_name[f'{first} {last}'] = eid
            suffix = f' -> linked to {linked_email}' if user_id else ''
            print(f'  created {first} {last} ({position}){suffix}')

        print('\nSeeding supervisor relationships...')
        for supervisor_name, subordinates in SUPERVISORS.items():
            sup_id = employee_ids_by_name.get(supervisor_name)
            if not sup_id:
                continue
            for sub_name in subordinates:
                sub_id = employee_ids_by_name.get(sub_name)
                if not sub_id:
                    continue
                cursor.execute(
                    "SELECT 1 FROM employee_supervisors WHERE employee_id = %s AND supervisor_employee_id = %s",
                    (sub_id, sup_id),
                )
                if cursor.fetchone():
                    continue
                cursor.execute(
                    "INSERT INTO employee_supervisors (employee_id, supervisor_employee_id) VALUES (%s, %s)",
                    (sub_id, sup_id),
                )
                print(f'  {supervisor_name} supervises {sub_name}')
        conn.commit()

        print('\nDone. Dev login password for every seeded user:', DEV_PASSWORD)


if __name__ == '__main__':
    main()
