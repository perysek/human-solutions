# Scaling-Prep Implementation Plan

**Status:** Ready to implement. Companion to `MULTI_TENANCY_PROPOSAL.md` — these
are the five low-risk, do-now items identified there that pay off once real
multi-tenancy/horizontal-scaling work (Phases A-E of that document) starts.
None of these five change user-facing behavior.

**Ordering:** CI first. Your instinct is right, and it's not just "safety net
first" as a platitude — concretely: Phase 2 adds new Alembic migrations, and
Phase 1's CI pipeline is what actually runs `alembic upgrade head` against a
real Postgres container and proves those migrations apply cleanly. Do Phase 2
before Phase 1 exists, and you're hand-verifying migrations locally with no
regression protection for every phase after. The rest of the ranking (2 → 3 →
4 → 5) holds as originally ordered — items 3-5 are independent of each other,
so that relative order is a preference, not a hard dependency; only "CI
before everything else" and "tenants table before the new-table guard"
(Phase 3 checks a pattern Phase 2 establishes) are real constraints.

---

## Phase 1 — CI Foundation

**Goal:** A GitHub Actions pipeline that runs on every PR: backend lint +
migration/smoke test, frontend lint + typecheck + build.

**Why now, in detail:** `requirements-dev.txt` already declares
`pytest`/`pytest-cov`/`pytest-mock`/`factory-boy` — but there is no `tests/`
directory and no `pytest.ini`/`pyproject.toml` anywhere in the repo. The test
*dependencies* were installed; the test *suite* was never started, and there
is no `.github/workflows/` at all. This phase fixes both gaps together: a
CI pipeline with nothing to run is nearly as useless as no CI, so Phase 1
includes writing the first real backend test, not just the workflow file.

### 1.1 — Backend: add a lint step (new, currently nothing lints `.py` files)

```bash
pip install ruff
```

Add to `requirements-dev.txt`:
```
ruff==0.9.4
```

Add `pyproject.toml` at repo root (doesn't exist yet):
```toml
[tool.ruff]
line-length = 120
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I"]  # pyflakes + pycodestyle + import-sort — start narrow, widen later
```

Run once locally first (`ruff check .`) and fix or `# noqa` what surfaces —
don't let the first CI run be a wall of 200 pre-existing violations blocking
every future PR.

### 1.2 — Backend: first real test + pytest config

```
tests/
  __init__.py
  conftest.py          # app fixture, test DB setup/teardown
  test_app_factory.py  # the one smoke test this phase requires
```

`tests/conftest.py` — the one non-trivial piece, because `create_app()`
(`app.py`) calls `initialize_pool()` and `assert_schema_current()`, which
require a real, migrated Postgres to exist:

```python
import os
import pytest

os.environ.setdefault('SECRET_KEY', 'test-secret-key-at-least-32-characters-long')
os.environ.setdefault('FLASK_ENV', 'testing')
os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/human_solutions_test')

from app import create_app  # noqa: E402 — must follow the env defaults above


@pytest.fixture()
def app():
    app = create_app()
    app.config.update(TESTING=True)
    yield app
```

`tests/test_app_factory.py`:
```python
def test_app_boots(app):
    assert app is not None


def test_health_endpoint(app):
    client = app.test_client()
    resp = client.get('/')
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'ok'
```

Add to `pyproject.toml`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
```

This is deliberately minimal — one boot test, one route test. The point of
Phase 1 isn't coverage, it's proving the CI pipeline (env vars → DB →
migrations → app boot → test run) actually works end-to-end, so every phase
after this one lands on a pipeline that's already been exercised.

### 1.3 — Frontend: already has what it needs

`frontend/package.json` already has `lint` (ESLint, `--max-warnings 0`) and
`build` (`tsc -b && vite build` — a failing `tsc -b` fails the build, which
*is* the typecheck). Nothing new to write here — Phase 1 just needs to wire
these two existing scripts into CI.

### 1.4 — The workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [master]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: human_solutions_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/human_solutions_test
      SECRET_KEY: test-secret-key-at-least-32-characters-long
      FLASK_ENV: testing
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .
      - run: alembic upgrade head
      - run: pytest

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

> **Known friction, not blocking:** `requirements.txt` pulls in
> `opencv-python`, `PyMuPDF`, `playwright`, `pandas` — unused legacy weight
> (per `MULTI_TENANCY_PROPOSAL.md` §2 grep confirmation). The `pip install`
> step above will take a couple of minutes because of this. Trimming
> `requirements.txt` would speed CI up but is a separate, out-of-scope
> cleanup — not part of this plan.

**Acceptance criteria:**
- A PR that breaks `ruff check`, a migration, the smoke test, ESLint, or
  `tsc -b` fails CI, visibly, before merge.
- A clean PR (e.g. this plan's own Phase 2 changes) goes green.

**Effort:** ~half a day, mostly the `conftest.py` DB wiring.

---

## Phase 2 — `tenants` table + `users.tenant_id`

**Goal:** Get the foundational schema piece in place — no application code
changes, no middleware, no RLS (those are `MULTI_TENANCY_PROPOSAL.md`'s
Phase C, deliberately not here). Purely: the column exists, is backfilled,
is `NOT NULL`, is indexed.

**Why one combined migration is fine here (unlike the proposal's later,
larger rollout):** `MULTI_TENANCY_PROPOSAL.md` §3.3 recommends splitting
add-column / backfill / not-null into separate revisions for zero-downtime
safety *at the point tenant count and data volume are real*. Today there's
one tenant and a small `users` table — the safety margin that split buys you
doesn't matter yet. Combining them now is less migration-file overhead for
equivalent risk; split them for real when Phase C of the bigger proposal
actually runs against a live multi-tenant dataset.

### 2.1 — `alembic/versions/xxxx_create_tenants_table.py`

```python
def upgrade() -> None:
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(63), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('plan', sa.String(50), nullable=False, server_default='trial'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.execute(
        "INSERT INTO tenants (slug, name, plan) VALUES ('staamp-poland', 'Staamp Poland', 'internal')"
    )
```

### 2.2 — `alembic/versions/xxxx_add_tenant_id_to_users.py`

```python
def upgrade() -> None:
    op.add_column('users', sa.Column('tenant_id', sa.Integer(), nullable=True))
    op.execute(
        "UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug = 'staamp-poland')"
    )
    op.alter_column('users', 'tenant_id', nullable=False)
    op.create_foreign_key('fk_users_tenant_id', 'users', 'tenants', ['tenant_id'], ['id'])
    op.create_index('idx_users_tenant_id', 'users', ['tenant_id'])
```

Run locally, confirm both apply cleanly against dev, then let Phase 1's CI
prove it against a fresh container on the PR.

**Explicitly out of scope for this phase** (all deferred to
`MULTI_TENANCY_PROPOSAL.md` Phase C): no `tenant_id` on any other table yet,
no tenant-resolution middleware, no RLS, no changes to any repository query.
`users.tenant_id` exists and is populated — nothing reads it yet.

**Acceptance criteria:**
- `alembic upgrade head` (via CI) creates `tenants` with one seeded row and
  `users.tenant_id` NOT NULL, indexed, FK-constrained, on every user.
- `alembic downgrade -1` (twice) cleanly reverses both migrations — check
  this manually once; it's not worth a CI job for two migrations.

**Effort:** ~1-2 hours.

---

## Phase 3 — "New tables get `tenant_id`" as an enforced convention

**Goal:** Stop the retrofit backlog from growing between now and
`MULTI_TENANCY_PROPOSAL.md` Phase B. A written convention that nobody
re-reads under deadline pressure doesn't hold — this repo already prefers
invariants enforced in code over comments (`assert_single_worker`,
`freeze_repository_singleton` are the existing examples) — so Phase 3 is a
CI check, not a docs page.

**Depends on:** Phase 1 (needs a CI job to run in) and Phase 2 (checks for
the pattern Phase 2 establishes — a guard with no precedent table to point
at is a harder sell in review).

### 3.1 — `scripts/check_new_migrations_have_tenant_id.py`

```python
"""CI guard: every newly-added Alembic migration that creates a table must
give that table a tenant_id column, unless it's explicitly exempted (global,
product-defined tables like roles/role_permissions — see
MULTI_TENANCY_PROPOSAL.md §3.2, 'Explicitly NOT tenant-scoped').

Only checks migration files ADDED in this diff — not the historical chain,
which predates the tenants table and is handled by Phase 2's own migrations,
not this guard.
"""
import re
import subprocess
import sys

EXEMPT_TABLES = {'tenants', 'roles', 'role_permissions', 'alembic_version'}

CREATE_TABLE_RE = re.compile(r"op\.create_table\(\s*['\"](\w+)['\"]")


def added_migration_files(base_ref: str) -> list[str]:
    out = subprocess.run(
        ['git', 'diff', '--name-only', '--diff-filter=A', f'{base_ref}...HEAD',
         '--', 'alembic/versions/'],
        capture_output=True, text=True, check=True,
    ).stdout
    return [f for f in out.splitlines() if f.endswith('.py')]


def check_file(path: str) -> list[str]:
    text = open(path, encoding='utf-8').read()
    violations = []
    for match in CREATE_TABLE_RE.finditer(text):
        table = match.group(1)
        if table in EXEMPT_TABLES:
            continue
        # crude but effective: does 'tenant_id' appear before the matching
        # close-paren's op.create_table call ends? Approximate by checking
        # the next ~2000 chars, which comfortably covers a real table's
        # column list without needing a full AST parse.
        window = text[match.start():match.start() + 2000]
        if 'tenant_id' not in window:
            violations.append(f"{path}: table '{table}' has no tenant_id column")
    return violations


if __name__ == '__main__':
    base_ref = sys.argv[1] if len(sys.argv) > 1 else 'origin/master'
    violations = []
    for f in added_migration_files(base_ref):
        violations.extend(check_file(f))
    if violations:
        print("New table(s) missing tenant_id (MULTI_TENANCY_PROPOSAL.md §3.2):")
        for v in violations:
            print(f"  - {v}")
        print("\nIf this table is genuinely global/product-defined (like roles), "
              "add it to EXEMPT_TABLES in scripts/check_new_migrations_have_tenant_id.py "
              "with a one-line reason.")
        sys.exit(1)
    print("OK — no new tenant-unaware tables.")
```

### 3.2 — Wire into `.github/workflows/ci.yml`'s `backend` job

```yaml
      - run: git fetch origin master --depth=1
      - run: python scripts/check_new_migrations_have_tenant_id.py origin/master
```

(Needs `fetch-depth: 0` or the explicit `git fetch` above — `actions/
checkout@v4`'s default shallow clone won't have `origin/master` to diff
against otherwise.)

**Acceptance criteria:**
- A PR adding a new table via `op.create_table` without a `tenant_id` column
  fails CI with a clear message pointing at the exemption escape hatch.
- A PR adding `tenants`/`roles`-style exempt tables, or a table that
  correctly includes `tenant_id`, passes.
- Test this once deliberately: write a throwaway migration missing
  `tenant_id`, confirm the job fails, delete it.

**Effort:** ~2-3 hours including testing the guard against a deliberately
broken migration.

---

## Phase 4 — Redis-backed rate limiter

**Goal:** Make `extensions.py`'s `Limiter` Redis-capable via config, with
local dev parity — **without** provisioning production Redis yet. Standing
up paid infrastructure (Vultr Managed Redis) is a deploy-time decision for
you to make and execute per `MULTI_TENANCY_PROPOSAL.md` §7/§8 — this phase
gets the code ready for that day, it doesn't spend money today.

### 4.1 — Make the storage backend configurable

`extensions.py` currently hardcodes `storage_uri='memory://'`. Change to:

```python
import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# 'memory://' by default (single-worker constraint, see config/runtime_guards.py) —
# set RATELIMIT_STORAGE_URI=redis://... once workers > 1 or you run more than
# one app node. See MULTI_TENANCY_PROPOSAL.md §6.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.environ.get('RATELIMIT_STORAGE_URI', 'memory://'),
)
```

### 4.2 — Dependency

Add to `requirements.txt`:
```
redis==5.2.1
```
(`flask-limiter` already supports `redis://` URIs once the `redis` client
package is importable — no `flask-limiter[redis]` extra needed, just the
underlying client.)

### 4.3 — Local dev parity — extend `docker-compose.yml`

Mirrors the existing Postgres-dev-parity reasoning already documented in
that file's header comment:

```yaml
services:
  db:
    # ... existing, unchanged ...

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
```

`.env.local` (dev, gitignored):
```
RATELIMIT_STORAGE_URI=redis://localhost:6379/0
```

### 4.4 — Verify

```bash
docker compose up -d redis
# .env.local has RATELIMIT_STORAGE_URI set
python run_dev.py
# hit a /public/sign-in/<token>/confirm endpoint 11 times quickly — the
# 10/minute limit (routes/public/routes.py) should 429 on the 11th, exactly
# as it does today with memory:// — behavior is identical, only the backing
# store changed
redis-cli -n 0 keys 'LIMITER*'   # confirm keys are actually landing in Redis
```

### 4.5 — Production

Add to `DEPLOYMENT.md`'s environment variable reference (not executed as
part of this plan — flagged for you to action when you actually provision):
`RATELIMIT_STORAGE_URI=redis://<vultr-managed-redis-host>:6379/0` in the
systemd `EnvironmentFile`.

**Acceptance criteria:**
- App boots and rate-limits identically with `RATELIMIT_STORAGE_URI` unset
  (unchanged `memory://` default — no regression for anyone who doesn't set
  the new var).
- With `docker compose up -d redis` running and the env var set, rate-limit
  counters are visibly in Redis (`redis-cli keys`), not in-process.

**Effort:** ~2-3 hours.

---

## Phase 5 — Structured JSON logging + request ID

**Goal:** JSON log lines carrying a `request_id` (and, once
`MULTI_TENANCY_PROPOSAL.md` Phase C lands, `tenant_id`) on every request,
replacing the current *unconfigured* logging setup — grep confirms no
`logging.basicConfig`/`dictConfig` exists anywhere in the app today, so this
is new configuration, not a migration off an existing scheme.

### 5.1 — Dependency

Add to `requirements.txt`:
```
python-json-logger==3.2.1
```

(A hand-rolled `logging.Formatter` subclass is a viable zero-new-dependency
alternative if you'd rather not add this — the library mainly saves you
correctly handling `exc_info`/stack traces in the JSON output.)

### 5.2 — `config/logging_config.py` (new)

```python
"""Structured JSON logging, configured once at app boot.

Every log record gets a request_id (from Flask g, blank outside a request
context — e.g. scripts/, migrations) so log lines from the same request can
be correlated across handlers/repositories without threading an argument
through every function signature.
"""
import logging
import sys

from flask import g
from pythonjsonlogger import jsonlogger


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.request_id = getattr(g, 'request_id', '-')
        except RuntimeError:
            record.request_id = '-'  # no app/request context (scripts, migrations)
        return True


def configure_logging(level: str = 'INFO') -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(jsonlogger.JsonFormatter(
        '%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s'
    ))
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
```

### 5.3 — Wire into `app.py`

```python
import uuid
from flask import g, request

from config.logging_config import configure_logging

configure_logging(os.environ.get('LOG_LEVEL', 'INFO'))

def create_app() -> Flask:
    app = Flask(__name__)
    # ... existing setup ...

    @app.before_request
    def _assign_request_id():
        g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))

    @app.after_request
    def _echo_request_id(response):
        response.headers['X-Request-ID'] = g.get('request_id', '-')
        return response
```

Every existing `logging.exception(...)`/`logger.info(...)` call across the
codebase (`config/database.py`, `repositories/audit_repository.py`,
`routes/public/routes.py`, etc.) needs **no changes** — they go through the
root logger, which now formats as JSON with `request_id` attached
automatically via the filter.

### 5.4 — Verify

```bash
python run_dev.py
curl -i http://localhost:5001/  # -i to see the X-Request-ID response header
```

Confirm stdout lines are valid JSON (`| python -m json.tool` on one line)
and carry a `request_id` matching the response header.

**Acceptance criteria:**
- Every log line at app runtime is valid JSON.
- A request's `X-Request-ID` response header matches the `request_id` field
  on every log line emitted while handling that request.
- A script run outside a request context (e.g. `scripts/seed_dev_data.py`)
  still logs without raising — `request_id` degrades to `'-'`, not a crash.

**Effort:** ~half a day.

---

## Summary

| # | Phase | Depends on | Effort | Touches |
|---|---|---|---|---|
| 1 | CI foundation | — | ~0.5 day | `.github/workflows/ci.yml`, `pyproject.toml`, `tests/`, `requirements-dev.txt` |
| 2 | `tenants` + `users.tenant_id` | Phase 1 (to verify it) | ~1-2 hrs | 2 new Alembic migrations |
| 3 | New-table `tenant_id` CI guard | Phase 1, Phase 2 | ~2-3 hrs | `scripts/check_new_migrations_have_tenant_id.py`, CI workflow |
| 4 | Redis-backed rate limiter | — | ~2-3 hrs | `extensions.py`, `docker-compose.yml`, `requirements.txt`, `.env.local` |
| 5 | Structured JSON logging | — | ~0.5 day | `config/logging_config.py`, `app.py`, `requirements.txt` |

Total: roughly 2-3 focused days, entirely reversible, zero user-facing
change, and every subsequent phase in `MULTI_TENANCY_PROPOSAL.md` gets
either cheaper (Phase 2 is most of the schema work for Proposal §3.2's
`users` row) or safer (Phases 1 and 3 guard everything that comes after).
