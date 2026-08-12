# Backend dev environment

This repo's `routes/`, `repositories/`, `database/`, `config/` were reference
material with acknowledged gaps (no `app.py`, no `services/`). This doc covers
what was added to make it a runnable backend, and how the local dev database
is set up so switching to a real Linux production Postgres later is a
one-line change, not a rewrite.

## What's installed on this machine

- **PostgreSQL 16** — installed natively via `winget install PostgreSQL.PostgreSQL.16`
  (not Docker: Docker Desktop needs WSL2, which wasn't installed and risks a
  forced reboot — see the "Docker option" section below for the alternative).
  Windows service `postgresql-x64-16`, listening on `localhost:5432`.
  Superuser `postgres` / `devpostgres123` (dev-only, not exposed beyond localhost).
- **Python 3.12** — installed via `winget install Python.Python.3.12`. The
  repo's pre-existing `.venv/` was built against Python 3.14, which has no
  prebuilt `psycopg2-binary` wheel yet (would require MS Visual C++ Build
  Tools to compile from source), so the working virtualenv is `.venv-py312/`
  instead. `.venv/` was left untouched, not deleted.
- Backend deps installed into `.venv-py312`: `Flask==3.1.3`, `Flask-Login==0.6.3`,
  `Flask-WTF==1.2.1`, `bcrypt==4.1.2`, `alembic==1.18.4`, `psycopg2-binary==2.9.10`,
  `python-dotenv==1.2.2` — a deliberate subset of `requirements.txt`: the OCR/PDF/
  SMS/pandas dependencies (`pytesseract`, `opencv-python`, `playwright`, `twilio`,
  `APScheduler`, …) belong to modules (invoice scanning, appointments, SMS) that
  aren't part of this build and would add a lot of install weight for nothing.

## Dev database

```
Role:     human_solutions_app / app_dev_pw_2026
Database: human_solutions_dev
```

Created with:

```sql
CREATE ROLE human_solutions_app WITH LOGIN PASSWORD 'app_dev_pw_2026';
CREATE DATABASE human_solutions_dev OWNER human_solutions_app;
```

Connection string lives in `.env.local` (gitignored) as `DATABASE_URL` — this
is the **only** thing that differs between dev and production. `config/
database.py` reads it via `psycopg2`/`ThreadedConnectionPool`; nothing else
in the codebase knows or cares whether Postgres is native, containerized, or
a managed cloud instance.

### The dev → production switch

1. Point `DATABASE_URL` at the production Postgres host (managed service, or
   a Postgres container/native install on the Linux box).
2. Run `alembic upgrade head` against it.
3. Do **not** run the dev seed script (`scripts/seed_dev_data.py`) against
   production — it's guarded to refuse running when `FLASK_ENV=production`.

Nothing in `app.py`, the repositories, or the routes changes.

### Docker option (not used now, documented for later)

`docker-compose.yml` at the repo root runs the identical `postgres:16-alpine`
image with the same role/database/password as the native install, for when
closer dev/prod image parity is worth installing Docker Desktop + WSL2 for:

```bash
docker compose up -d
# .env.local's DATABASE_URL already matches this compose file's credentials
```

## CSRF

Disabled app-wide (`WTF_CSRF_ENABLED = False` in `app.py`). The reference
project's CSRF protection is a server-rendered-page mechanism (`<meta
csrf-token>` + a fetch/XHR-patching shim in `base.html`) that this SPA has
no equivalent of. Per-blueprint exemption (`csrf.exempt(bp)`) was tried
first but proved unreliable under the dev reloader — requests intermittently
failed CSRF depending on session state after a reload, which pointed at a
Flask-WTF blueprint-object-identity issue rather than anything fixable in
route code. Disabling it app-wide is the honest version of the same
simplification, not a stealth workaround. Before this ever serves real
traffic: implement double-submit-cookie CSRF (a `/auth/csrf-token` endpoint
+ `X-CSRFToken` header the frontend attaches, verified server-side).

## Running the backend

```powershell
.venv-py312\Scripts\Activate.ps1     # or call python.exe directly
alembic upgrade head                  # apply the full migration chain
python scripts\seed_dev_data.py       # seed roles/users/employees (dev only)
python run_dev.py                     # http://localhost:5001
```

The Vite dev server (`frontend/`) proxies `/auth`, `/system`, and
`/employees/api` to `127.0.0.1:5001` — see `frontend/vite.config.ts`.
