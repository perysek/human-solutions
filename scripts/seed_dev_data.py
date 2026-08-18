"""
Dev-only seed data.

Seeds one user account per Staamp HR role (superadmin/hr_manager/trainer/
viewer) so a fresh dev database has something to log in with immediately.
Worker-linked seed data (a real `workers` row per account, competency/
training history, etc.) lands once the domain tables exist — see
IMPLEMENTATION_PLAN.md Phases 1-2 and 8 (legacy SQLite migration).

Idempotent — re-running skips anything that already exists by email.
Refuses to run when FLASK_ENV=production.

Usage:
    python scripts/seed_dev_data.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / '.env')
load_dotenv(_BASE_DIR / '.env.local', override=True)

if os.environ.get('FLASK_ENV') == 'production':
    raise SystemExit('Refusing to run the dev seed script with FLASK_ENV=production.')

from app import create_app
from repositories.users.user_repository import UserRepository

DEV_PASSWORD = 'DevPass123!'

USERS = [
    dict(email='superadmin@dev.local', full_name='Aleksandra Nowak', role='superadmin'),
    dict(email='hr.manager@dev.local', full_name='Marek Kowalski', role='hr_manager'),
    dict(email='trainer@dev.local', full_name='Katarzyna Wiśniewska', role='trainer'),
    dict(email='viewer@dev.local', full_name='Piotr Zieliński', role='viewer'),
]


def main():
    app = create_app()
    with app.app_context():
        user_repo = UserRepository()

        print('Seeding users...')
        for u in USERS:
            if user_repo.get_by_email(u['email']):
                print(f"  {u['email']} already exists, skipping")
                continue
            user_repo.create_user(
                email=u['email'], password=DEV_PASSWORD,
                full_name=u['full_name'], role=u['role'],
            )
            print(f"  created {u['email']} ({u['role']})")

        print('\nDone. Dev login password for every seeded user:', DEV_PASSWORD)


if __name__ == '__main__':
    main()
