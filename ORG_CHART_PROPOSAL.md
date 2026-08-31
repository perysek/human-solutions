# Org Chart & Revision History — UI/Backend Wiring Proposal

**Status: proposal only.** The two migrations this doc wires up
(`8f053c175547`, `0811375b3298`) are written and applied on dev; nothing
described below — no repository method, route, or React page — exists yet.
This is the plan to review before any of it gets built.

---

## 1. What the migrations actually gave us

| Migration | Adds | Business meaning |
|---|---|---|
| `8f053c175547` | `departments.parent_department_id` (self-FK, nullable, `ON DELETE RESTRICT`) | Departments can nest to arbitrary depth — a division containing several departments, each with its own sub-teams. |
| `0811375b3298` | `org_chart_revisions` table + `bump_org_chart_revision()` trigger on `departments`/`jobs` | An append-only log (`id` = revision number, `revised_at`, `trigger_source`) that grows automatically whenever the chart's *shape* changes — never on worker hire/fire/reassignment. |

Neither migration touches `workers` or the existing `is_managerial`/
`is_director` derivation. The chart is still 100% derived, never stored —
see `e2f3a4b5c6d7`'s docstring for why that principle matters here.

---

## 2. RBAC placement

Two different pages, two different sensitivity levels — reuse existing
modules rather than invent new ones:

- **Org Chart (visual tree)**: gate on `module_permission_required('jobs')`,
  exactly like `routes/departments/routes.py` already piggybacks
  department access on the `jobs` module (its own docstring: *"działy
  istnieją wyłącznie jako atrybut stanowisk"*). The org chart is the same
  kind of read: departments + jobs, no worker PII beyond names already
  visible on `/departments`.
- **Revision History (raw change log)**: gate on the **`audit`** module —
  `role_permissions.module_name = 'audit'` already exists in the RBAC seed
  (superadmin-only today, per the current grants), reserved for the
  still-pending Phase 7 audit-trail viewer (`IMPLEMENTATION_PLAN.md`
  "Next step"). A structural-change log is the same category of thing as an
  audit log — reusing the module means this doesn't need its own
  `role_permissions` seed migration, and naturally inherits whatever access
  Phase 7 eventually grants to that module.

---

## 3. Backend wiring

### 3a. `DepartmentRepository` — accept and validate `parent_department_id`

`create()`/`update()` currently take only `(name, description)`. Extend
both to accept `parent_department_id: Optional[int]`, and add:

```python
def get_ancestry(self, department_id: int) -> list[int]:
    """Walk parent_department_id up to the root. Used by both the cycle
    guard below and the frontend's parent-picker (to exclude a department's
    own descendants, not just itself, from the dropdown)."""
    ...

def would_create_cycle(self, department_id: int, new_parent_id: int | None) -> bool:
    """True if setting department_id's parent to new_parent_id would make
    department_id its own ancestor. Walk new_parent_id's ancestry
    (get_ancestry) and check whether department_id appears in it."""
    ...
```

This is the follow-up the `8f053c175547` docstring already flagged as
required and NOT covered by the schema itself — Postgres has no native
"acyclic self-reference" constraint, so this has to be a repository-level
check, called from `routes/departments/routes.py`'s `api_create`/
`api_update` before the write, raising `ConflictError` on a hit — same
pattern as the existing one-manager-per-department precheck in
`api_add_jobs`.

**Worth a decision, not mine to make silently**: this cycle-check logic is
genuinely new complexity, not a one-line tweak. `departments`/`jobs` today
have no dedicated `services/` file — validation lives inline in
`routes.py` or the repository. I'd introduce `services/department_service.py`
now specifically to hold `validate_parent_assignment()`, rather than
growing `routes.py` further — but say if you'd rather keep it in the
repository to match the current (service-less) pattern for this table.

### 3b. New: `services/org_chart_service.py`

The tree-assembly logic from the earlier proposal turns into one function:

```python
def get_org_chart_tree() -> dict:
    """Recursive department tree (WITH RECURSIVE over parent_department_id)
    + each department's manager (jobs.is_managerial join) + regular workers
    grouped under their department + the company director (jobs.is_director,
    department-agnostic root) hanging above every top-level department.
    Read-only assembly across DepartmentRepository/JobRepository/
    WorkerRepository — no single one of those tables owns "the org chart",
    so this doesn't belong pinned to any one of them (same reasoning as
    dashboard_service.py's own multi-repository summary)."""
```

### 3c. New: `repositories/org_chart/org_chart_revision_repository.py`

Thin — the table is written only by the trigger, never by application code,
so this repository is read-only:

```python
class OrgChartRevisionRepository(BaseRepository):
    def get_latest(self) -> Optional[dict]:
        """SELECT ... ORDER BY id DESC LIMIT 1 — powers the small
        'Rev. 8 · updated 31.08.2026 19:17' badge on the chart page."""

    def list_paginated(self, page: int, per_page: int) -> dict:
        """Same page/per_page/total shape as every other PaginatedTable
        consumer in this app (WorkerRepository et al.)."""
```

`trigger_source` (e.g. `jobs:BRYGADZISTA:UPDATE:is_managerial;`) is a
debugging-oriented raw string, not directly user-facing — the service layer
translates it into Polish before the frontend ever sees it (§3e).

### 3d. New: `routes/org_chart/routes.py`

```
GET  /org-chart/api/tree               -> module_permission_required('jobs')
GET  /org-chart/api/revisions/latest   -> module_permission_required('jobs')   # for the badge
GET  /org-chart/api/revisions          -> module_permission_required('audit')  # ?page=&per_page=
```

`revisions/latest` is gated the same as the tree itself (not `audit`) —
"what revision am I looking at" is part of viewing the chart, not the
sensitive part; the *full history* behind `audit` is.

Register the blueprint in `app.py` alongside the other `_bp` registrations.

### 3e. Human-readable revision labels

`trigger_source` parsing lives in `org_chart_service.py`, not the frontend —
keeps the raw log format free to change without a frontend redeploy:

```python
_LABELS = {
    'is_managerial': 'zmiana kierownika działu',
    'is_director': 'zmiana Dyrektora zakładu',
    'department_id': 'przeniesienie stanowiska do innego działu',
    'parent_department_id': 'zmiana struktury działów',
}
# 'departments:5:INSERT' -> "Dodano dział (ID 5)"
# 'jobs:BRYGADZISTA:DELETE' -> "Usunięto stanowisko kierownicze (BRYGADZISTA)"
# 'jobs:BRYGADZISTA:UPDATE:is_managerial;' -> "Zmiana kierownika działu (BRYGADZISTA)"
```

---

## 4. Frontend wiring

### 4a. `DepartmentForm.tsx` — parent department picker

Add a `Select` field "Dział nadrzędny" (optional), options from the
existing `GET /departments/api/options` endpoint — filtered client-side to
exclude the department being edited **and its descendants**
(`get_ancestry`-derived set from the tree endpoint), so an obviously-invalid
cycle can't even be selected, ahead of the server's authoritative
`would_create_cycle` check. In create mode, no filtering needed (a brand
new department has no descendants yet).

### 4b. `DepartmentsListPage.tsx` — surface the hierarchy

Add a "Dział nadrzędny" column (parent's name, or "—" for top-level), and
indent child-department rows under their parent — cheapest way to make the
nesting visible in the existing table without building the tree view twice.

### 4c. New page: `pages/org-chart/OrgChartPage.tsx`

A plain recursive React component — nested cards connected by simple CSS
borders/lines, **not a new dependency**. `package.json` currently has no
chart/tree/diagram library, and this app's own precedent (DESIGN.md's "no
second interaction idiom" rule, cited against adding a tab component in
Phase 3) argues against pulling in `react-flow`/`d3`/`dagre` for a shape
this simple: Director → department managers → their sub-departments →
workers. If it later needs pan/zoom/drag for a much bigger org, that's a
deliberate upgrade to reconsider then, not a default to reach for now.

Header shows the revision badge from `GET /org-chart/api/revisions/latest`
("Rev. 8 · 31.08.2026, 19:17") with a link through to the history page.

### 4d. New page: `pages/org-chart/OrgChartRevisionsPage.tsx`

`PaginatedTable` (the existing shared component) over
`GET /org-chart/api/revisions` — columns: revision #, date, human-readable
description (§3e). No edit/delete affordances anywhere on this page — it's
a read-only log, matching `audit_log`'s own viewer-to-be.

### 4e. Nav (`navConfig.ts`)

```ts
// "Kadry" section, after "Działy firmy":
{
  label: 'Struktura organizacyjna',
  to: '/org-chart',
  iconPath: ICON_ORG_CHART,       // new glyph — simple hierarchy/tree icon
  visible: (ctx) => ctx.hasModuleAccess('jobs'),
},

// "System" section, after "Progi alertów":
{
  label: 'Historia struktury',
  to: '/org-chart/revisions',
  iconPath: ICON_HISTORY,          // new glyph — clock/history icon
  mobileHide: true,
  visible: (ctx) => ctx.hasModuleAccess('audit'),
},
```

Plus two new `<Route>` entries in `router.tsx`, and a `lib/api/orgChart.ts`
client module matching the existing `lib/api/departments.ts` shape.

---

## 5. Explicitly out of scope for this pass

- Editing the org chart *from* the diagram (drag a box onto another
  department) — v1 is read-only display; editing stays on the existing
  Departments/Jobs forms.
- Emailing/notifying anyone when a revision fires — the log is pull, not push.
- Exporting the chart (PDF/PNG) — not asked for; flagging so it's a
  deliberate future ask, not an assumed one.
