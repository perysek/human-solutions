"""
Shared pytest fixtures.

The one non-trivial piece: create_app() (app.py) calls initialize_pool() and
assert_schema_current(), which require a real, migrated Postgres to exist.
The env defaults below point at a local `human_solutions_test` database —
CI (Phase 1.4) spins up a matching postgres:16 service container and runs
`alembic upgrade head` against it before pytest runs; locally, create that
database once and migrate it the same way (see SCALING_PREP_PLAN.md §1.2).
"""
import os

import pytest

os.environ.setdefault('SECRET_KEY', 'test-secret-key-at-least-32-characters-long')
os.environ.setdefault('FLASK_ENV', 'testing')
os.environ.setdefault('DATABASE_URL', 'postgresql://human_solutions_app:app_dev_pw_2026@localhost:5432/human_solutions_test')

from app import create_app  # noqa: E402 — must follow the env defaults above


@pytest.fixture()
def app():
    flask_app = create_app()
    flask_app.config.update(TESTING=True)
    yield flask_app
