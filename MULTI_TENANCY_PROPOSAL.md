# Multi-Tenancy Proposal — Staamp (human-solutions)

**Status:** Proposal — not started. Companion to `IMPLEMENTATION_PLAN.md` §"Konsekwencje
dla tego planu", which explicitly deferred this decision: *"Plan nie wprowadza
wielodostępności (multi-tenancy) na tym etapie... Build pozostaje single-tenant."*
This document is that deferred decision, written against the actual schema and
deployment as they exist today (see `DEPLOYMENT.md`).

**Business framing:** Staamp is an HR/training-competency system per company
(workers, job positions, skills, medical exams, BHP training, action plans,
presence confirmation). Going multi-tenant means: many client companies, each
with its own workers/departments/data, isolated from every other company, on
shared infrastructure. This is the standard B2B SaaS shape — **one tenant =
one company**, not "one user, many workspaces" (Slack-style). That framing
drives every recommendation below, especially "no workspace switcher needed."

---

## 1. Recommendation summary

| Decision | Recommendation |
|---|---|
| Isolation model | **Shared database, `tenant_id` column on every domain table + Postgres Row-Level Security (RLS)** — not schema-per-tenant, not DB-per-tenant |
| Tenant resolution | Derived from the logged-in user's `users.tenant_id` (session), not subdomain — add subdomain routing later only if self-serve signup requires it |
| Role model | Keep `roles`/`role_permissions` **global** (product-defined: superadmin/hr_manager/trainer/viewer) — don't let tenants customize roles yet. Scope role *assignment* per user per tenant. |
| Workspace switcher | **Skip it.** Ordinary users belong to exactly one tenant. Add a separate, audited **platform-admin support/impersonation** path for Staamp's own ops staff instead of a Slack-style switcher. |
| Scaling blocker | Fix the single-Gunicorn-worker constraint (in-memory SSE queue + rate limiter) **before or alongside** tenant rollout — it blocks horizontal scaling regardless of tenancy model |
| Infra evolution | Stay on Vultr. Move Postgres to **Vultr Managed Database**, add **Redis** (managed or self-hosted), scale app nodes behind a **Vultr Load Balancer**. Skip Kubernetes for now — not justified at this team/traffic size. |
| Billing | Seat/usage-based on **active worker count** (the natural unit this domain already tracks), via **Stripe Billing** |

---

## 2. Why shared-DB + `tenant_id` + RLS (not the alternatives)

| Model | Isolation strength | Ops burden | Migration story | Verdict |
|---|---|---|---|---|
| **DB-per-tenant** | Strongest | High — N databases to migrate, back up, monitor, connection-pool | `alembic upgrade head` × N tenants on every deploy | Overkill pre-revenue; revisit only for a large enterprise customer demanding physical isolation |
| **Schema-per-tenant** | Strong | Medium-high — `search_path` juggling, connection pool can't share across schemas easily with `psycopg2.pool.ThreadedConnectionPool` as currently used (`config/database.py`) | Alembic multi-schema migrations are fiddly | Better than DB-per-tenant, still more ops than the team size warrants |
| **Shared DB, `tenant_id` column, app-level filtering only** | Weak — one missed `WHERE tenant_id = ?` in ~13 repository modules is a cross-tenant data leak | Low | Simple `ALTER TABLE ADD COLUMN` + backfill | Cheapest, but the failure mode (silent data leak) is unacceptable for HR/medical data |
| **Shared DB, `tenant_id` column + Postgres RLS** ✅ | Strong — enforced at the database layer, survives an app-layer mistake | Low-medium | Same migration as above, plus `CREATE POLICY` per table | **Recommended** |

RLS is the deciding factor: `repositories/base_repository.py` builds raw SQL by
string-formatting `table_name`, and every domain repository (`workers`,
`trainings`, `medical`, `bhp`, `skills`, `jobs`, `departments`, `action_plans`,
...) writes its own hand-rolled queries beyond the base CRUD methods. That's
~13 repository modules where a developer could forget a tenant filter on a
new query six months from now. RLS makes that mistake fail closed instead of
leaking data — a query that omits the tenant filter simply returns zero rows
for other tenants, it cannot return them.

This app already handles GDPR Art. 9 special-category data (`medical_exams`,
`bhp_trainings`) — a cross-tenant leak here isn't just an embarrassing bug,
it's a reportable breach. RLS as defense-in-depth is proportionate to that risk.

---

## 3. Data model changes

### 3.1 New `tenants` table

```sql
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(63) UNIQUE NOT NULL,       -- url/subdomain-safe identifier
    name VARCHAR(255) NOT NULL,             -- display name (e.g. "Staamp Poland")
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'trial',   -- ties into §8 billing
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Tables that need a `tenant_id` column

Grounded in the actual Alembic history, not a guess — every table below is a
real table created by a migration in `alembic/versions/`:

| Domain | Tables (from migrations) |
|---|---|
| Identity | `users` (`3144e1f9ace7`, `b1c2d3e4f5a6`) |
| Org structure | `workers` + personal-data tables (`f5a6b7c8d9e0`), `departments`, `job_type` (`c9d0e1f2a3b4`), `jobs`, `skills` (`d3e4f5a6b7c8`) |
| Competency | competency-matrix tables (`a6b7c8d9e0f1`) — worker↔skill ratings |
| Training | `trainings`, participants (`7e2feddd7715`), presence-confirmation tables (`a658de63e223`) |
| Compliance | `medical_exams`, `bhp_trainings` (`dbd528235721`) |
| HR lifecycle | `action_plans` (`c3d4e5f6a7b8`, `d4e5f6a7b8c9`), `worker_terminations` (`k1l2m3n4o5p6`), `worker_onboarding_status` (`m2n3o4p5q6r7`) |
| Ops | `alert_thresholds` (`9c1d2e3f4a5b`), `import_logs` (`v7w8x9y0z1a2`), `audit_log` (baseline, widened `e4f5a6b7c8d9`) |

**Explicitly NOT tenant-scoped:** `roles`, `role_permissions`. The role
catalog (superadmin/hr_manager/trainer/viewer + their module permissions,
seeded by `c2d3e4f5a6b7_seed_staamp_rbac.py`) is a product constant, not a
per-tenant customization — keeping it global avoids ~4× the RBAC surface
area for zero customer value at this stage. Revisit only if a customer
contractually demands custom roles.

### 3.3 Migration approach (Alembic, phased — no downtime)

Standard expand/contract pattern, one Alembic revision per phase:

1. **Add column, nullable**, `tenant_id INTEGER REFERENCES tenants(id)`, on
   every table in §3.2.
2. **Backfill**: insert one `tenants` row for the existing customer
   ("Staamp Poland"), then `UPDATE <table> SET tenant_id = <that id>` for
   every existing row.
3. **Make `NOT NULL`** once backfilled (a second migration, not the same one
   — keeps each step revertible independently).
4. **Index**: `CREATE INDEX ON <table> (tenant_id)` on every table — every
   RLS policy and every remaining app-level query filters on it, this is the
   single most load-bearing index in the schema post-migration.
5. **Enable RLS + policy**, per table:

```sql
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON workers
    USING (tenant_id = current_setting('app.current_tenant_id')::INTEGER);
```

`app.current_tenant_id` is a session-local Postgres setting, set once per
request (§4.1) — not a value the app trusts from the request itself.

6. Repeat for every table in §3.2 — this is mechanical but must be
   exhaustive; a table without a policy is invisible to RLS entirely (RLS is
   opt-in per table, unlike a global default).

**Effort note:** step 5 (RLS policy) is trivial per table. Steps 1-4 are
trivial too. The real cost is §4.2 — updating every hand-rolled query in
~13 repository modules that currently has no tenant awareness at all.

---

## 4. Application-layer enforcement

### 4.1 Tenant resolution middleware

Add a `before_request` hook in `app.py` (next to the existing idle-timeout
guard, `config/session_guard.py`) that, once `current_user` is resolved:

```python
@app.before_request
def _set_tenant_context():
    if current_user.is_authenticated:
        g.tenant_id = current_user.tenant_id
        conn = DatabaseConnection.get_connection()
        with conn.cursor() as cur:
            cur.execute("SET LOCAL app.current_tenant_id = %s", (g.tenant_id,))
```

`SET LOCAL` scopes the setting to the current transaction — it can't leak
across requests even though connections are pooled and reused
(`config/database.py`'s `ThreadedConnectionPool`). This is the same
per-request-connection pattern `DatabaseConnection.get_connection()` already
relies on, so it composes with existing code rather than fighting it.

### 4.2 Repository layer

`repositories/base_repository.py`'s generic `get_by_id`/`get_all`/`delete`/
`restore` are one choke point — worth adding a `_tenant_scoped: bool = True`
class flag there that appends `AND tenant_id = current_setting(...)` (or,
simpler: rely on RLS alone here and don't duplicate the filter in Python —
RLS already guarantees it, app-level filtering is redundant defense, not the
only line of defense).

The real work is the ~13 domain repositories' **custom** queries (worker
skill gap reports, training rosters, dashboard aggregates, competency
matrices, etc.) — each needs an audit pass to confirm RLS covers it (it will,
automatically, for any plain `SELECT`/`UPDATE`/`DELETE` — RLS applies
regardless of how the query is constructed) and that any `INSERT` sets
`tenant_id` on the new row (RLS does **not** auto-populate inserted values —
add `tenant_id` to every `INSERT` explicitly, sourced from `g.tenant_id`).

**Where this bites hardest:** `services/training_presence_service.py`
(`routes/public/routes.py`) — the one genuinely unauthenticated surface,
reached by a bare token in a URL with no `current_user` at all. Tenant
context there must come from a `tenant_id` column on whatever the token
resolves to (a training/session row), not from a session — this path needs
explicit, manual review; it cannot rely on the `before_request` hook in §4.1.

### 4.3 Signup / provisioning

New endpoint (or an internal-only admin action, not self-serve, until §8's
billing flow exists): create a `tenants` row + the first `superadmin` user
for it, transactionally. Follow the same pattern as the manual bootstrap
already documented in `DEPLOYMENT.md` Step 12, generalized to accept a
`tenant_id`.

---

## 5. RBAC and access model

- **Role catalog stays global**, per §3.2 — superadmin/hr_manager/trainer/
  viewer, defined once, available to every tenant identically.
- **`users.tenant_id`** binds an account to exactly one company. A user
  logging in only ever sees their own tenant's data — enforced by RLS, not
  by a UI-level "current workspace" concept, so there's nothing to switch.
- **Platform-admin role** (new, Staamp's own team only, not exposed to
  customers): can query across tenants for support, but every cross-tenant
  read must go through an **impersonation flow that writes to `audit_log`**
  (already exists in this schema) — "logged in as tenant X for support,
  reason: ticket #123" — rather than an ambient global-superuser bypass of
  RLS. Implement as a Postgres role that `BYPASSRLS`, granted only to the
  backend's platform-admin code path, never to the general app connection.
- **`own_data` permission flag** already exists (`role_permissions.own_data`,
  `config/auth_config.py`'s `own_data_worker_id`) — this scopes a `trainer`
  role to their own linked worker record *within* a tenant. Multi-tenancy
  adds a layer above this, it doesn't replace it: tenant isolation first,
  then existing own-data scoping within the tenant.

---

## 6. Scalability — fix these regardless of tenancy timing

Multi-tenancy and horizontal scaling are separate axes, but two existing
constraints block scaling out no matter how tenancy is modeled, and get
worse (not better) as tenant count grows:

| Constraint | Where | Fix |
|---|---|---|
| Gunicorn hard-capped at 1 worker (`assert_single_worker`, `config/runtime_guards.py`) | in-memory SSE import-progress queue + (planned) APScheduler | Move import progress to Redis pub/sub or a polled DB table; move scheduled jobs to Celery beat (or keep APScheduler but back it with a Redis/DB advisory lock so only one instance fires it) |
| Flask-Limiter uses `storage_uri='memory://'` (`extensions.py`, explicitly documented as tied to the single-worker constraint) | Rate limiting on `/public/*` | Switch to `storage_uri='redis://...'` — becomes mandatory the moment `workers > 1` or you run more than one app node |

Once both are externalized to Redis, `workers` can go above 1 on a single
node, **and** the app can run on more than one node behind a load balancer —
which is what actually lets tenant count and traffic scale, independent of
the tenancy data model in §2-§5.

---

## 7. Deployment architecture

`DEPLOYMENT.md` (single Vultr VPS, single Gunicorn worker, single Postgres
instance) is the right target for **one tenant**. For multiple tenants at
meaningful scale, evolve it — not a rewrite, an incremental upgrade of the
same Vultr-based stack:

```
                         Vultr Load Balancer :443
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              App node 1     App node 2     App node N
              Nginx+Gunicorn Nginx+Gunicorn Nginx+Gunicorn   (workers>1 now safe — §6)
              frontend/dist  frontend/dist  frontend/dist    (same static build, deployed to each)
                    │              │              │
                    └──────────────┼──────────────┘
                                   ▼
                    Vultr Managed Database (PostgreSQL 16)
                    RLS policies enforce tenant isolation (§3)
                                   ▲
                                   │
                    Vultr Managed Redis (or self-hosted)
                    rate-limit storage + import-progress pub/sub + Celery broker
```

**Why not Kubernetes:** this app has exactly one process type (Gunicorn +
static files behind Nginx), one background-job type, one datastore. K8s earns
its complexity when you have many services, need per-service autoscaling, or
need a scheduler managing heterogeneous workloads — none of which apply here.
A Vultr Load Balancer + a few identical VPS app nodes + Managed Postgres +
Managed Redis gets the same horizontal scaling and HA with far less
operational surface for a small team. Revisit if the team grows enough to
carry a platform/SRE function, or the workload genuinely diversifies (e.g. a
real async worker fleet separate from web nodes).

**Migration from the current single-VPS setup:**
1. Provision Vultr Managed Database (PostgreSQL 16), migrate data with
   `pg_dump`/`pg_restore` (small dataset today — cheap to do with a brief
   maintenance window).
2. Point the existing VPS's `DATABASE_URL` at the managed instance, confirm
   it works, *then* decommission the local `postgresql` install.
3. Add Vultr Managed Redis, wire `extensions.py`'s `storage_uri` to it, fix
   §6's two constraints, bump `workers` in `gunicorn.conf.py`.
4. Clone the app node (image/snapshot the working VPS, or — better —
   introduce a proper CI/CD deploy per §9 so nodes are reproducible from git,
   not from a hand-configured snapshot), put a Vultr Load Balancer in front.
5. Only then run the `tenant_id`/RLS migration from §3 against the shared
   managed database — infra scaling and the tenancy data model are
   independent workstreams and can land in either order, but doing infra
   first means the tenancy migration ships onto infrastructure that can
   already take the load.

---

## 8. Techstack additions

| Need | Recommendation | Why |
|---|---|---|
| Cache / rate-limit store / pub-sub | **Redis** (Vultr Managed Redis) | Directly required by §6; also a natural home for per-tenant caching later |
| Background jobs (SMS, scheduled reports, imports) | **Celery + Redis broker**, or stay on **APScheduler** with a Redis/Postgres advisory lock if job volume stays low | Celery is the standard choice if job volume grows; APScheduler+lock is less new infrastructure if it doesn't |
| Payments/subscriptions | **Stripe Billing** (seats or metered on active worker count) | Handles PCI scope, invoicing, dunning — building this in-house is not a good use of engineering time pre-scale |
| Error tracking | **Sentry** | Nothing currently — `journalctl`/log-tailing (per `DEPLOYMENT.md`) doesn't scale past one node, and per-tenant error correlation matters once there are multiple customers |
| CI/CD | **GitHub Actions**: run tests + `alembic upgrade --sql` dry-run on PRs; on merge to `master`, build, run migrations against a staging DB, deploy to app nodes | Replaces the manual `git pull && restart` flow in `DEPLOYMENT.md` once there's more than one node to keep in sync |
| Infra-as-code | **Terraform** (Vultr provider) once there are 3+ app nodes | Below that, manual provisioning is still fine — don't adopt this prematurely |
| Structured logging | JSON logs (stdlib `logging` + a JSON formatter) tagged with `tenant_id` and `request_id` | Makes per-tenant debugging and support-impersonation audit trails (§5) actually searchable across nodes |

---

## 9. Compliance and enterprise trust

Relevant because this domain handles GDPR Art. 9 special-category data
(`medical_exams`, `bhp_trainings`) per-employee, per-company:

- **Data residency**: keep Vultr region in Amsterdam or Warsaw (already the
  recommendation in the sibling deployment doc) — matters more, not less,
  once there are multiple EU companies as customers.
- **Per-tenant export/erasure**: a customer offboarding must be able to get
  a full export and then verified deletion of their tenant's data. Because
  every table is `tenant_id`-scoped (§3), both operations become
  `WHERE tenant_id = ?` sweeps across the table list in §3.2 — mechanical,
  not a redesign, *if* the schema is fully tenant-scoped by then.
- **Audit trail**: `audit_log` already exists — extend it to cover
  platform-admin impersonation (§5) specifically, since that's the one path
  that legitimately crosses tenant boundaries and is exactly what a customer
  will ask about during a security review.
- **SOC 2**: not worth pursuing pre-revenue/pre-first-enterprise-customer —
  flag it as a milestone tied to when a specific customer contractually
  requires it, not a default target.

---

## 10. Phased rollout

Mirrors this repo's existing phase-based planning convention
(`IMPLEMENTATION_PLAN.md`):

1. **Phase A — Infra foundation** (§7 steps 1-3): Managed Postgres, Managed
   Redis, fix single-worker constraint. Ships with zero user-visible change;
   de-risks everything after it.
2. **Phase B — Schema migration** (§3): `tenants` table, `tenant_id` on every
   table, backfilled to one tenant, RLS enabled. Still single-tenant in
   practice (one row in `tenants`) — this phase is "prove the isolation
   mechanism works with today's one customer" before a second customer ever
   touches it.
3. **Phase C — Application enforcement** (§4): tenant-resolution middleware,
   repository audit pass, provisioning flow, platform-admin impersonation
   path (§5). This is where a second tenant becomes safe to onboard.
4. **Phase D — Horizontal deploy** (§7 steps 4-5): multiple app nodes behind
   the load balancer, CI/CD (§8). Decoupled from B/C — can land earlier if
   traffic demands it before tenant count does.
5. **Phase E — Billing** (§8 Stripe): gated on Phase C; no point metering
   tenants that can't yet be safely isolated.

Phases A and D are pure infra and carry no data-model risk — safe to start
immediately, independent of when B/C/E are prioritized against other product
work.
