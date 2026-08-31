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
    """Walk parent_department_id UP to the root, server-side only — this is
    the direction would_create_cycle needs. NOT the same traversal as the
    frontend's parent-picker filter (§4a), which needs department_id's
    DESCENDANTS instead (walking down) — an easy direction mixup to make,
    worth being explicit about so nobody reaches for this method there."""
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

### 3f. `routes/departments/routes.py` + `_department_json()` — carry the new column

`create()`/`update()`'s request bodies gain `parent_department_id`
(int-or-null, same optional-field convention as `description`).
`api_create` and `api_update` validate it exists before delegating to the
repository (`NotFoundError` — a bogus id would otherwise 500 on the FK
constraint instead of failing cleanly), and `api_update` additionally
relies on the repository's `would_create_cycle` check (§3a).

`_department_json()` gains two fields on the response:
```python
'parent_department_id': row['parent_department_id'],
'parent_name': row.get('parent_name'),   # LEFT JOIN departments AS parent
```
Both the edit form (to pre-select the current parent) and the breadcrumb on
`DepartmentEditPage` (§4c) need `parent_name` — without the join, the
frontend would have to cross-reference a second full department list just
to show one string, for every single department detail view.

---

## 4. Frontend wiring

### 4a. `DepartmentForm.tsx` — parent department picker

New prop, `allDepartments: DepartmentListItem[]` — passed down already-
fetched by the parent page (§4b/§4c), not fetched inside the form itself
(avoids a duplicate request every time the form mounts). New `Select` field
"Dział nadrzędny" (optional — "Brak" for top-level), submitting
`parent_department_id` alongside `name`/`description`.

Options filtering differs by mode:
- **create**: no filtering — a department that doesn't exist yet can't be
  anyone's ancestor, so every existing department is a valid parent.
- **edit**: exclude the department itself **and every one of its
  descendants** — assigning a department under its own child would be an
  obviously-invalid cycle the UI shouldn't even offer, ahead of the
  server's authoritative check. This is a **descendant** walk (down the
  tree), the mirror image of `get_ancestry` (§3a, which walks up) — computed
  purely client-side from `allDepartments` (every department already
  carries its own `parent_department_id`, so the full tree is reconstructible
  without another endpoint):

```ts
// lib/utils/departmentTree.ts
export function getDescendantIds(rootId: number, all: DepartmentListItem[]): Set<number> {
  const childrenOf = new Map<number, number[]>();
  for (const d of all) {
    if (d.parent_department_id != null) {
      childrenOf.set(d.parent_department_id, [...(childrenOf.get(d.parent_department_id) ?? []), d.id]);
    }
  }
  const result = new Set<number>();
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (result.has(next)) continue; // defensive: never loop even over already-bad data
    result.add(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return result;
}
```

A `409` from the server's `would_create_cycle` check (a race, or a client
list that's gone stale) surfaces through the form's *existing*
`ApiError`/`flash-error` handling — no new error-handling code needed here.

### 4b. `DepartmentCreatePage.tsx`

One addition: `useApiData(() => departmentsApi.list(), [])`, passed to
`<DepartmentForm mode="create" allDepartments={...} .../>` as the picker's
option source. No exclusion logic needed (create mode, §4a).

### 4c. `DepartmentEditPage.tsx` — extend, don't fork a new ViewPage

**Decision, and the reasoning behind it**: this app's dictionary tables
split two ways — `Jobs` gets a standalone `JobViewPage.tsx` (real
relationships: linked skills, linked workers) while `Skills` has none (flat
`id`+`description`, list+inline-edit is enough). `Departments` currently
sits on the flat side (`DepartmentEditPage` already *is* a hybrid edit
page — it renders the form **and** a live "Stanowiska w dziale" section
below it, computed by filtering the already-fetched job list client-side).
`parent_department_id` gives departments real relationships too (parent,
children) — the same trigger that gave Jobs its ViewPage — but rather than
forking a *third* navigation pattern (`List → View → Edit`, alongside
Jobs's `List → View → Edit` and today's Departments `List → Edit-with-
detail`), the more consistent move is extending the page departments
already have. Two additions, mirroring the "Stanowiska w dziale" section's
existing shape exactly:

1. **Parent breadcrumb** in the `PageHeader` subtitle — `department.name`
   plus, when `parent_department_id` is set, a link built from the new
   `parent_name` field (§3f) to `/departments/<parent_id>/edit`. One click
   up the tree, reusing this same page.

2. **New "Działy podrzędne" section**, directly parallel to the existing
   jobs-in-department table:
   ```tsx
   const { data: allDepartments } = useApiData(() => departmentsApi.list(), []);
   const childDepartments = useMemo(
     () => (allDepartments?.departments ?? []).filter((d) => d.parent_department_id === departmentId),
     [allDepartments, departmentId],
   );
   ```
   Rendered as a table (name, job/worker counts already in `_department_json`)
   with each row linking to `/departments/<childId>/edit` — clicking a
   child navigates into *its* edit-with-detail view, giving free recursive
   drill-down through the whole tree without any dedicated tree-browsing UI.

The same `allDepartments` fetch feeds `DepartmentForm`'s parent picker
(§4a) — one request serves the breadcrumb, the children section, and the
picker's exclusion set.

**Still open**: today `canWrite` (from `isModuleReadOnly('jobs')`) only
gates the *write* affordances (the "Dodaj stanowiska" button, remove-job
icons) — the form itself always renders editable. Worth confirming whether
a `viewer` role should be able to land on this page at all to see a
department's detail read-only, or whether that's blocked further up
(`ProtectedRoute`/nav visibility) before this even loads — not something to
guess silently given it's a real access-control question, not a UI detail.

### 4d. `DepartmentsListPage.tsx` — surface the hierarchy in the list too

Add a "Dział nadrzędny" column (parent's name, or "—" for top-level), and
sort/indent rows into tree order instead of the current flat alphabetical
list — the same `getDescendantIds`-style graph-walk from §4a, generalized
into a depth-first ordering, so a parent's children always appear grouped
directly under it rather than scattered wherever their name sorts
alphabetically.

### 4e. New page: `pages/org-chart/OrgChartPage.tsx`

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

### 4f. New page: `pages/org-chart/OrgChartRevisionsPage.tsx`

`PaginatedTable` (the existing shared component) over
`GET /org-chart/api/revisions` — columns: revision #, date, human-readable
description (§3e). No edit/delete affordances anywhere on this page — it's
a read-only log, matching `audit_log`'s own viewer-to-be.

### 4g. Nav (`navConfig.ts`)

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
