# Absence Management — Implementation Plan

Golden standard: `faktura_scanner_flask` branch `invoices-app` (`services/absence_service.py`,
`services/absence_balance_service.py`, `repositories/absences/*`, `routes/absence_routes.py`,
`routes/absence_balance_routes.py`). That app is Flask + Jinja2 server-rendered; this app
(`human-solutions`) is Flask JSON API + React 18/TS/Vite. The port keeps the golden standard's
data model and business logic almost verbatim and rebuilds the UI layer as React pages instead
of Jinja templates.

## Key differences from the golden standard (why this isn't a straight copy)

1. **Worker key type**: golden standard's `employee_id` is `INTEGER`. This app's `workers.id`
   is `TEXT` (natural key, e.g. `"9001"`). Every FK/column below uses `TEXT`.
2. **No appointment-conflict feature**: the golden standard checks new absences against client
   appointments (salon domain) and has a whole conflict-resolution/reassignment/SMS subsystem.
   HR/training has no client scheduling — this entire subsystem (`absence_conflict_resolutions`,
   reassignment SMS, live-conflict modal) is **dropped**. Absence conflict-checking here only
   means "does this worker already have an overlapping absence."
3. **No stored supervisor FK on workers**: `workers.boss_id` was already dropped in this repo;
   "przełożony" is now derived at query time from `job.is_managerial` + department, and can be
   zero or multiple people. That's fine for a display label, not for a deterministic one-request-
   one-approver workflow. Plan: a new explicit `worker_absence_approvers` mapping table (same
   role the golden standard's `employee_supervisors` plays), editable by HR, optionally
   pre-suggested from the derived org-chart "boss" but not coupled to it.
4. **RBAC is DB-backed module permissions** (`role_permissions` table, `superadmin / hr_manager /
   trainer / viewer`), not the golden standard's flat `superuser/admin/receptionist/...`. A new
   `'absences'` module entry is added to `ALL_MODULES` / `PERMISSION_MATRIX`
   (`config/auth_config.py`, `alembic/…seed_staamp_rbac.py`-style migration). Every role gets at
   least `own_data` access (everyone can submit/view/cancel their own requests); approval rights
   come from the `worker_absence_approvers` mapping, independent of role.
5. **No SMS/email infra in this app.** "Notifications" = in-app: a pending-approval badge count
   (mirrors the golden standard's `pending_count`) plus balance-warning badges, surfaced on the
   dashboard and worker profile using the existing `alert_service.py` bucket pattern. Every
   mutation is already audit-logged via `AuditRepository`, matching this repo's existing pattern.
6. **Found in passing, not fixed here**: `employees`, `employee_absences`, `absence_categories`,
   `employee_supervisors`, `employee_absence_limits`, `absence_balance_adjustments`,
   `absence_conflict_resolutions`, `employee_services`, `employee_time_off` are orphaned salon-
   domain tables left in the DB from before the Staamp HR pivot (Phase 0 removed the Python code,
   not the tables). New tables below are named `worker_absence_*` to avoid any collision;
   dropping the orphaned tables is flagged as a separate cleanup, not part of this feature.

## Category engine = your "customizable + standard" requirement

There is no separate "holiday calendar" table in the golden standard, and none is needed here:
every absence type — vacation, on-demand leave, sick leave (L4), home office, maternity/parental
leave, private time-slot, or any future custom type — is just a row in
`worker_absence_categories` with per-category toggles:
`is_tracked` (count against a limit or not), `count_period` (yearly/monthly/rolling),
`resets_at`, `rolling_days`, `warning_threshold_pct`, `default_max_value`, and
`absence_full_day` (whole days vs. an hour slot within one day). That row-level toggle set *is*
the "toggle-switch settings per category with balance count against defined limits" ask — no
extra schema needed, just the admin UI to flip them (Phase 6).

Seed set (editable afterward, nothing hardcoded): Urlop wypoczynkowy (26 d/yr, tracked), Urlop na
żądanie (4 d/yr, tracked), Zwolnienie lekarskie L4 (untracked — informational), Home office
(monthly cap, tracked), Urlop macierzyński/rodzicielski (untracked — statutory, no cap to
enforce), Wyjście prywatne (hour-slot, monthly cap, tracked).

## Phases

**Phase 0 — Schema.** Migrations creating `worker_absence_categories`, `worker_absences`,
`worker_absence_approvers`, `worker_absence_limits`, `worker_absence_balance_adjustments` (column
shapes ported 1:1 from the golden standard's four tables, FKs retargeted to `workers.id TEXT`);
seed the six categories above. Add `'absences'` to RBAC (`ALL_MODULES`, `PERMISSION_MATRIX`,
seed migration).

**Phase 1 — Repositories.** `repositories/absences/{category,absence,approver,limit,adjustment}_repository.py`
following this repo's `BaseRepository`/`AuditableMixin` conventions (see `repositories/workers/`
for the pattern this repo actually uses).

**Phase 2 — Services.** `services/worker_absence_service.py` and
`services/worker_absence_balance_service.py` — ported near-verbatim from the golden standard
minus appointment-conflict methods; absence-vs-absence overlap check stays.

**Phase 3 — JSON API routes.** `routes/absences/routes.py`, one blueprint, mirroring
`routes/workers/routes.py` conventions (`module_permission_required('absences')`, JSON in/out,
no `render_template`/`flash`). Self-service, management (approve/reject/manual/edit/delete),
categories CRUD, balances/limits/adjustments/audit endpoints, plus new approver-assignment
endpoints (`GET/POST/DELETE /api/workers/<id>/absence-approvers`).

**Phase 4 — React frontend.** `pages/absences/{MyAbsences,AbsenceManagement,AbsenceBalances,
AbsenceCategorySettings}Page.tsx` + `lib/api` client functions + nav entry gated by
`permissions.absences`. Category settings page is where the toggle switches live.

**Phase 5 — Dashboard/notification wiring.** Pending-approval badge (nav + dashboard), balance-
warning badges on worker profile, reusing `alert_service.py`'s bucket pattern.

**Phase 6 — Tests.** Repository/service tests mirroring the golden standard's
`tests/{repositories,services}/test_absence_*.py`, adapted to `TEXT` worker ids and the reduced
(no-appointment) conflict scope; a frontend smoke test per page.

## Open question for you

Everything above is my recommended default, grounded in what's actually in both repos — I did
not find a place where I'm genuinely stuck, except phasing/pace. See the question below.
