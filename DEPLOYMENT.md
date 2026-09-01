# Staamp (human-solutions) — Vultr Production Deployment Guide

Step-by-step guide for deploying **this** application — the Flask + PostgreSQL
backend under `routes/`/`repositories/`/`services/` plus the React/Vite SPA in
`frontend/` — to a fresh Vultr Ubuntu 22.04 VPS.

> **Note on the other `DEPLOYMENT_VULTR.md` in this repo root:** that file is
> leftover boilerplate for a *different* project ("MyWay Beauty Salon" /
> `perysek/faktura_scanner_flask` — invoice OCR + salon booking). It was
> copy-pasted in early on and never adapted. Don't follow it for this app —
> wrong repo URL, wrong app name, wrong dependencies. This guide replaces it
> for `human-solutions`; consider deleting or archiving the old one.

---

## ⚠️ Before you start — repo inconsistencies to fix

These are copy-paste leftovers from the sibling project found while writing
this guide. They don't block a deploy, but they cause confusing logs/errors
later. Fix them (or at least know about them) first:

1. **`gunicorn.conf.py`** hardcodes `/var/log/my-way-beauty-salon/{access,error}.log`
   and `proc_name = "my-way-beauty-salon"`. Either rename these to
   `/var/log/human-solutions/...` and `human-solutions` (and create that log
   dir in Step 9 instead), or keep the old name — just be consistent. This
   guide assumes you rename them.
2. **`config/runtime_guards.py`**'s `assert_single_worker` error message says
   *"MyWay Beauty Salon must run with exactly ONE worker process"*. Cosmetic
   only (the check itself is real and correct for this app too — see the
   single-worker note in Step 13), but worth a one-line fix for anyone who
   hits it.
3. **`.env.example`**'s `DATABASE_URL` defaults to `faktura_user`/`faktura_db`,
   and `UPLOAD_FOLDER`/`PDF_FOLDER`/`TEMP_DIR`/`TESSERACT_CMD`/`POPPLER_PATH`
   point at `/opt/faktura-scanner/...`. None of those five file-path vars are
   read anywhere in the currently-registered blueprints (grep confirms it) —
   they're OCR/invoice leftovers. Safe to leave out of `.env` entirely; this
   guide's `.env` (Step 10) omits them.

---

## Overview

```
Your Local Machine                    Vultr VPS (Ubuntu 22.04)
──────────────────                    ─────────────────────────
GitHub repo         ──── git clone ──► /opt/human-solutions/
(perysek/human-solutions)                  │
                                            ├── .venv/              (Python)
                                            ├── .env                (secrets)
                                            ├── frontend/dist/       (built SPA — Nginx serves this directly)
                                            └── gunicorn.conf.py

                                      PostgreSQL 16 (native, localhost:5432)

                                      Gunicorn — SINGLE worker (systemd service)
                                            │  binds 127.0.0.1:8083
                                            ▼
                                      Nginx :80/:443
                                        ├── /            → static files from frontend/dist (SPA)
                                        ├── /auth, /system, /public  → proxy to Gunicorn
                                        └── /{module}/api            → proxy to Gunicorn
```

**Why frontend and backend must share one origin:** `app.py` runs no CSRF
middleware because it assumes every request is same-origin fetch/XHR from the
SPA (`SESSION_COOKIE_SAMESITE=Lax` + a same-origin check, not a token). If you
ever serve the SPA from a different domain/subdomain than the API, sessions
and CSRF assumptions break. Nginx serving both under one domain (this guide)
is what keeps that assumption true in production.

**Why Gunicorn must run exactly one worker:** `config/runtime_guards.py`
(`assert_single_worker`, wired into `gunicorn.conf.py`) refuses to boot with
`workers != 1`. The app holds in-memory per-process state — an SSE-fed import
progress queue and (once wired up) an APScheduler instance — that a second
worker process wouldn't share. `gunicorn.conf.py` already sets `workers = 1`,
`worker_class = "gthread"`, `threads = 4` to get request concurrency without
multiple processes. Don't change `workers` without externalizing that state
first.

---

## Prerequisites

- Vultr account at vultr.com
- SSH key pair (`ssh-keygen -t ed25519` if you don't have one)
- GitHub access to `perysek/human-solutions`
- A domain name pointed at the server (optional, but required for HTTPS via
  Let's Encrypt in Step 17 — and for `SESSION_COOKIE_SECURE=true`)

---

## Step 1 — Create the Vultr Instance

1. vultr.com → **Deploy** → **Cloud Compute**
2. Settings:
   - **Image:** Ubuntu 22.04 LTS x64
   - **Plan:** 1 vCPU / 2 GB RAM is enough (no OCR/image workload in this
     app, unlike the sibling salon app) — 2 GB avoids OOM under the
     PostgreSQL + Gunicorn + Nginx combo though, so don't go below that.
   - **SSH Keys:** add your public key
   - **Hostname:** `human-solutions`
3. **Deploy Now**, note the server's IP from the dashboard.

---

## Step 2 — Initial Server Setup

```bash
ssh root@YOUR_SERVER_IP

adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

su - deploy
```

> Running the app as `root` means a bug or exploit gets full server access.
> `deploy` uses `sudo` when needed but the app itself never runs elevated.

---

## Step 3 — Install System Dependencies

```bash
sudo apt-get update && sudo apt-get upgrade -y

# Python 3.11 + build tools (Ubuntu 22.04 has python3.11 in universe)
sudo apt-get install -y python3.11 python3.11-venv python3-pip build-essential git nginx
```

No Tesseract/Poppler/OpenCV system packages are needed — those belong to the
sibling salon app's invoice-OCR feature, which this codebase doesn't import
(confirmed by grep: `cv2`/`pytesseract`/`fitz` appear nowhere in the active
routes/services). `requirements.txt` still lists those Python packages
(`pytesseract`, `opencv-python`, `PyMuPDF`, `twilio`, `APScheduler`,
`playwright`) as unused legacy weight from the same copy-paste — they'll
install fine as pure `pip` packages, they just won't be imported or exercised.

---

## Step 4 — Install Node.js (for the Vite/React frontend build)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

node --version   # v20.x.x
npm --version
```

---

## Step 5 — Install and Configure PostgreSQL 16

Ubuntu 22.04's default `postgresql` apt package installs **v14**. Dev
(`BACKEND_SETUP.md`) and `docker-compose.yml` both use **v16** — install the
same major version in production via the PGDG repo, so there's no
version-specific SQL/behavior surprise:

```bash
sudo apt-get install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt-get install -y postgresql-16

sudo systemctl status postgresql   # active (running)
```

Create the database and app role (mirrors the dev naming in
`docker-compose.yml`, different password):

```bash
sudo -u postgres psql << 'SQL'
CREATE USER human_solutions_app WITH PASSWORD 'choose_a_strong_password_here';
CREATE DATABASE human_solutions_prod OWNER human_solutions_app;
GRANT ALL PRIVILEGES ON DATABASE human_solutions_prod TO human_solutions_app;
\q
SQL

psql -U human_solutions_app -h localhost -d human_solutions_prod -c "SELECT version();"
```

---

## Step 6 — Deploy the Application

```bash
sudo mkdir -p /opt/human-solutions
sudo chown deploy:deploy /opt/human-solutions

git clone https://github.com/perysek/human-solutions.git /opt/human-solutions
cd /opt/human-solutions

# Deploy `master` once this feature branch is merged. Until then, deploy
# whatever branch is actually meant to go live:
git checkout master
git log --oneline -3
```

> If you SSH in as `root` for any of this instead of `deploy`, git will
> refuse to run in a directory owned by another user
> (`fatal: detected dubious ownership`). Fix:
> `git config --global --add safe.directory /opt/human-solutions`

---

## Step 7 — Python Virtual Environment

```bash
cd /opt/human-solutions

python3.11 -m venv .venv
source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
```

---

## Step 8 — Build the Frontend

```bash
cd /opt/human-solutions/frontend

npm install
npm run build      # tsc -b && vite build → outputs to frontend/dist/

ls -la dist/index.html   # should exist
```

Nginx (Step 14) serves `frontend/dist/` directly as static files — the
Flask app does **not** serve the SPA (`routes/main/routes.py`'s `/` is just a
JSON health-check stub; "the frontend runs separately").

---

## Step 9 — Create the Log Directory

```bash
sudo mkdir -p /var/log/human-solutions
sudo chown deploy:deploy /var/log/human-solutions
```

This matches the renamed `accesslog`/`errorlog` paths from the
"Before you start" section. If you chose to keep `gunicorn.conf.py`'s
original `my-way-beauty-salon` paths instead, create that directory name here
and skip renaming the config.

There's no `data/uploads`, `data/pdfs`, or `data/temp` to create — this app
doesn't do file uploads/OCR (unlike the sibling app the old paths came from).

---

## Step 10 — Configure Environment Variables

```bash
cd /opt/human-solutions

python3 -c "import secrets; print(secrets.token_hex(32))"
# copy the printed value for SECRET_KEY below

nano .env
```

```env
SECRET_KEY=paste_the_generated_32_byte_hex_key_here
FLASK_ENV=production

# 'true' only once HTTPS is live end-to-end (Step 17) — over plain HTTP the
# browser drops a Secure cookie and login silently breaks.
SESSION_COOKIE_SECURE=false

DATABASE_URL=postgresql://human_solutions_app:choose_a_strong_password_here@localhost:5432/human_solutions_prod

# Absolute public origin — used to build the QR-scannable mobile
# presence-confirmation sign-in link (routes/trainings/routes.py). Must be
# the real public URL, not localhost, once this is live.
FRONTEND_URL=https://your-domain.com

# Optional connection-pool tuning (config/database.py defaults shown):
# DB_POOL_MIN=2
# DB_POOL_MAX=10
# DB_CONNECT_TIMEOUT=5
# DB_STATEMENT_TIMEOUT=30000

# Optional — rate-limiter storage backend (extensions.py). Unset defaults to
# in-process memory://, which is correct as long as gunicorn.conf.py's
# `workers = 1` holds (assert_single_worker). Only set this once you
# provision Redis (e.g. Vultr Managed Redis) and move to workers > 1 or
# multiple app nodes — see SCALING_PREP_PLAN.md Phase 4 /
# MULTI_TENANCY_PROPOSAL.md §6/§7/§8. Not provisioned as part of this guide.
# RATELIMIT_STORAGE_URI=redis://<vultr-managed-redis-host>:6379/0
```

`SECRET_KEY` is validated at boot (`app.py`) — the app refuses to start if
it's unset, under 32 characters, or a placeholder. It signs both session
cookies and (once implemented) CSRF tokens.

`.env` is already in `.gitignore`. Confirm with `git status` before ever
committing anything in this directory.

---

## Step 11 — Apply Database Migrations

Alembic is the only source of schema truth for a fresh production database —
`initialize_database()`/`schema.sql` is a legacy fallback path
(`config/database.py`'s `assert_schema_current()` checks Alembic head at
every boot and **refuses to start** if the DB is behind it):

```bash
cd /opt/human-solutions
source .venv/bin/activate
export $(grep -v '^#' .env | xargs)

alembic upgrade head
```

Verify:

```bash
psql -U human_solutions_app -h localhost -d human_solutions_prod -c "\dt"
psql -U human_solutions_app -h localhost -d human_solutions_prod -c "SELECT version_num FROM alembic_version;"
```

---

## Step 12 — Bootstrap the First Superadmin User

`scripts/seed_dev_data.py` is dev-only — it refuses to run when
`FLASK_ENV=production` (it checks the env var explicitly). There is no
production-safe seed script in the repo, so create the first account directly
through the same repository method the app itself uses (hashes the password
with bcrypt — never insert a plaintext or hand-rolled hash via `psql`):

```bash
cd /opt/human-solutions
source .venv/bin/activate
export $(grep -v '^#' .env | xargs)

python3 << 'PYEOF'
from app import create_app
from repositories.users.user_repository import UserRepository

app = create_app()
with app.app_context():
    repo = UserRepository()
    user_id = repo.create_user(
        email='YOUR_ADMIN_EMAIL',
        password='CHOOSE_A_STRONG_TEMP_PASSWORD',
        full_name='YOUR NAME',
        role='superadmin',
    )
    print(f'Created superadmin, id={user_id}')
PYEOF
```

Log in and change the password immediately afterward if the app exposes a
self-service change-password flow; otherwise re-run `create_user` (it's
idempotent by email — a duplicate email is rejected, not overwritten) or
update it directly via `UserRepository`.

---

## Step 13 — Create the systemd Service

```bash
sudo nano /etc/systemd/system/human-solutions.service
```

```ini
[Unit]
Description=Human Solutions (Staamp) — Flask Application
After=network.target postgresql.service

[Service]
User=deploy
Group=deploy
WorkingDirectory=/opt/human-solutions
EnvironmentFile=/opt/human-solutions/.env
ExecStart=/opt/human-solutions/.venv/bin/gunicorn \
    -c gunicorn.conf.py \
    "app:create_app()"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable human-solutions
sudo systemctl start human-solutions

sudo systemctl status human-solutions
journalctl -u human-solutions -n 50
# Look for: [INFO] Listening at: http://127.0.0.1:8083
```

> **Do not set `WEB_CONCURRENCY` or edit `workers` in `gunicorn.conf.py` above
> 1.** `assert_single_worker` in `config/runtime_guards.py` will abort startup
> if you do — see the Overview section for why.

---

## Step 14 — Configure Nginx

Unlike a typical setup where Nginx just proxies everything to the app server,
here Nginx must **serve the built SPA directly** from `frontend/dist/` *and*
selectively proxy only the backend's actual URL prefixes — mirroring
`frontend/vite.config.ts`'s dev-server proxy table exactly, so nothing in
production routes differently than in dev.

```bash
sudo nano /etc/nginx/sites-available/human-solutions
```

```nginx
server {
    listen 80;
    server_name your-domain.com;          # or `server_name _;` for bare-IP access

    client_max_body_size 5M;

    root /opt/human-solutions/frontend/dist;
    index index.html;

    # Vite's hashed asset filenames — safe to cache forever
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # --- Backend API — must match frontend/vite.config.ts's proxy table ---
    location /auth {
        proxy_pass         http://127.0.0.1:8083;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
    location /system {
        proxy_pass         http://127.0.0.1:8083;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
    location /public {
        proxy_pass         http://127.0.0.1:8083;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
    # '/jobs', '/departments', '/skills', '/workers', '/medical', '/bhp',
    # '/trainings', '/dashboard' are ALSO React Router pages — only the
    # '/api' suffix under each is the backend's JSON API, so only that
    # suffix is proxied (bare '/jobs' etc. falls through to the SPA below).
    location /jobs/api        { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /departments/api { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /skills/api      { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /workers/api     { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /medical/api     { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /bhp/api         { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /trainings/api   { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    location /dashboard/api   { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }
    # ORG_CHART_PROPOSAL.md §4g — '/org-chart' is ALSO a React Router page
    # (OrgChartPage), same '/api'-suffix-only scoping as the rest above.
    location /org-chart/api   { proxy_pass http://127.0.0.1:8083; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }

    # --- Everything else: the SPA, with client-side routing fallback ---
    location / {
        try_files $uri /index.html;
    }
}
```

> `ProxyFix(x_for=1, x_proto=1, x_host=1)` in `app.py` trusts exactly **one**
> proxy hop for `X-Forwarded-For`/`X-Forwarded-Proto`/`X-Host` — matching
> Nginx being the only proxy in front of Gunicorn here. Don't put another
> proxy/CDN in front of this Nginx without adjusting that.

```bash
sudo ln -s /etc/nginx/sites-available/human-solutions /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t          # must say "syntax is ok"
sudo systemctl restart nginx
```

---

## Step 15 — Configure Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

sudo ufw status
```

Port 8083 should **not** be open externally — Gunicorn binds to
`127.0.0.1:8083` only; Nginx reaches it over loopback.

---

## Step 16 — Verify the Deployment

```bash
sudo systemctl status human-solutions
sudo systemctl status nginx
sudo systemctl status postgresql

curl -s -o /dev/null -w "SPA:  HTTP %{http_code}\n" http://localhost/
curl -s -o /dev/null -w "auth: HTTP %{http_code}\n" http://localhost/auth/me   # or any real auth GET route

journalctl -u human-solutions -f
```

Open `http://YOUR_SERVER_IP/` (or your domain) in a browser — you should get
the SPA's login page, and logging in with the superadmin account from Step 12
should work end-to-end (frontend → Nginx → Gunicorn → PostgreSQL).

---

## Step 17 — SSL with Let's Encrypt (requires a domain)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

sudo certbot renew --dry-run
```

Then flip `SESSION_COOKIE_SECURE=true` in `.env` and restart:

```bash
sudo sed -i 's/^SESSION_COOKIE_SECURE=.*/SESSION_COOKIE_SECURE=true/' /opt/human-solutions/.env
sudo systemctl restart human-solutions
```

---

## Maintenance Commands

### Full update (pull + backend deps + frontend build + migrations + restart)

```bash
cd /opt/human-solutions
git fetch origin
git pull origin master

source .venv/bin/activate
export $(grep -v '^#' .env | xargs)
pip install -r requirements.txt

cd frontend
npm install
npm run build
cd ..

alembic upgrade head

sudo systemctl restart human-solutions
sudo systemctl status human-solutions --no-pager
```

### Restart only

```bash
sudo systemctl restart human-solutions
```

### Rotate SECRET_KEY (after any suspected exposure)

Invalidates every active session on purpose — that's the point.

```bash
cd /opt/human-solutions
NEW=$(python3 -c "import secrets; print(secrets.token_hex(32))")
sudo sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$NEW|" .env
sudo systemctl restart human-solutions
```

### Logs

```bash
journalctl -u human-solutions -f              # app stdout/stderr
tail -f /var/log/human-solutions/access.log   # Gunicorn requests
tail -f /var/log/human-solutions/error.log    # Gunicorn errors
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Database backup / restore

```bash
pg_dump -U human_solutions_app -h localhost human_solutions_prod \
  > /root/human_solutions_$(date +%Y%m%d_%H%M%S).sql

psql -U human_solutions_app -h localhost human_solutions_prod \
  < /root/human_solutions_YYYYMMDD_HHMMSS.sql
```

---

## Troubleshooting

### App won't start — `RuntimeError: DATABASE_URL environment variable is not set`

```bash
cat /opt/human-solutions/.env | grep DATABASE_URL
sudo systemctl cat human-solutions | grep EnvironmentFile
```

### App won't start — `SECRET_KEY must be set to a high-entropy value`

`.env`'s `SECRET_KEY` is missing, under 32 chars, or matches the
`.env.example` placeholder. Regenerate per Step 10.

### App won't start — `MyWay Beauty Salon must run with exactly ONE worker process`

Cosmetic wrong-app-name message from `config/runtime_guards.py` (see
"Before you start"), but the underlying check is real: something set
`workers` in `gunicorn.conf.py` above 1, or `WEB_CONCURRENCY` is set in the
environment. Fix the config, don't bypass the guard.

### App won't start — `Database schema is at Alembic revision 'X', but the code expects 'Y'`

You deployed new code without running migrations. Run:

```bash
cd /opt/human-solutions && source .venv/bin/activate
export $(grep -v '^#' .env | xargs)
alembic upgrade head
sudo systemctl restart human-solutions
```

### 502 Bad Gateway

```bash
sudo systemctl status human-solutions
journalctl -u human-solutions -n 50
ss -tlnp | grep 8083   # Gunicorn should be listening here
```

### SPA loads but every API call 404s / login does nothing

Almost always an Nginx `location` mismatch — a blueprint's real
`url_prefix` (check `routes/*/routes.py`) doesn't match what's proxied in
Step 14's Nginx config, or a new module was added without adding its
`/module/api` location block (and its matching entry in
`frontend/vite.config.ts`'s dev proxy). Check both files stay in sync when a
new blueprint is added.

### Blank page / broken client-side routing (hard refresh on a sub-route 404s)

`frontend/dist/index.html` missing, or the `location / { try_files ...; }`
fallback in Nginx isn't in place. Confirm `frontend/dist/index.html` exists
(Step 8) and `nginx -t` reports the config as valid.

### `fatal: detected dubious ownership in repository`

```bash
git config --global --add safe.directory /opt/human-solutions
```

### Permission denied on log directory

```bash
sudo chown -R deploy:deploy /var/log/human-solutions
```

---

## Architecture Summary

```
Internet
    │
    ▼
Nginx :80 / :443
    │  serves frontend/dist/ directly (SPA + hashed static assets)
    │  proxies /auth, /system, /public, and /{module}/api to Gunicorn
    ▼
Gunicorn :8083 (127.0.0.1 only) — 1 worker, 4 threads (gthread)
    │  managed by systemd (auto-restart, boot start)
    ▼
Flask app (app:create_app())
    │  loads .env via python-dotenv, ProxyFix(x_for=1) trusts Nginx's hop
    │  Flask-Login session auth, Flask-Limiter on /public/* endpoints
    ▼
PostgreSQL 16 :5432 (localhost only)
    │  database: human_solutions_prod
    │  user: human_solutions_app
    │  schema: Alembic-managed, checked against head at every boot
```

---

## Cost Reference

| Component | Cost |
|-----------|------|
| 1 vCPU / 2 GB VPS | ~$12/month |
| PostgreSQL (self-hosted, same server) | included |
| Automatic Vultr backups (optional) | +20% of instance price |
| SSL via Let's Encrypt | free |
