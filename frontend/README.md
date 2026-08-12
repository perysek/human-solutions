# MyWay — React Frontend

A React + TypeScript + Vite rebuild of the reference project's server-rendered
Flask/Jinja2/Tailwind frontend, now wired to a **real Flask + PostgreSQL
backend** (see `../BACKEND_SETUP.md` at the repo root). It reproduces the
**GUI/UI design system** (tokens, sidebar, layout, form/table/modal
components, icons, auth flow) as defined in `GUI-GOLDEN-BOOK.md`,
`GUI-COMPONENTS-GOLDEN-BOOK.md`, and `gui-components/*.md` at the repo root —
those documents remain the source of truth for anything visual.

## Getting started

Backend first — see `../BACKEND_SETUP.md` for the one-time PostgreSQL/Python
setup, then:

```powershell
.venv-py312\Scripts\python.exe run_dev.py       # http://localhost:5001
```

Then the frontend:

```bash
cd frontend
npm install
npm run dev                                     # http://localhost:5173
```

Log in with any of the accounts `scripts/seed_dev_data.py` creates (shown on
the login screen) — shared password `DevPass123!`.

## What's here

```
src/
  styles/           tokens.css, base.css, components.css — ported verbatim
                     from the reference project's static/css/input.css
                     (@layer base/components). Class names kept identical.
  lib/
    icons/           Icon.tsx + paths.ts — React port of templates/components/
                     icons.html (Material Symbols, same dictionary pattern).
    auth/            AuthContext (real session via GET/POST /auth/*),
                     ProtectedRoute guard.
    api/             Typed fetch clients per resource: users.ts, roles.ts,
                     employees.ts, client.ts (shared fetch wrapper),
                     useApiData.ts (loading/error hook used by every page).
    feedback/        ToastProvider (Notifications.*) and ConfirmProvider
                     (confirm_modal.html's destructive-action dialog, now a
                     promise-based useConfirm() hook).
    a11y/            useFocusTrap — shared by the mobile sidebar drawer and
                     the confirm dialog.
    useTableSort.ts  Client-side column sort, shared by the 3 list pages.
  components/
    layout/          Sidebar, SidebarSection (accordion), NavIcon (24×24
                     stroke icon set — separate from lib/icons' filled-glyph
                     system, exactly as gui-components/sidebar.md specifies),
                     ThemeSwitcher (4 light-family themes), AppShell,
                     AuthLayout (centers the login/forgot/reset pages).
    ui/              Button, PageHeader, EmptyState, StatCard, SortableTh,
                     PlaceholderPage, form field primitives (form.tsx) — the
                     React equivalents of templates/components/form_fields.html
                     and scrollable_table.html's macros.
  pages/
    users/, roles/, employees/   Full CRUD: List/View/Edit/Create pages +
                     a shared *Form.tsx per entity.
    absences/        Still placeholders — out of this pass's scope.
  router.tsx         Route tree + permission guards.
```

## Design system fidelity

- **Tokens** (`styles/tokens.css`): the full `:root` custom-property set plus
  all three `[data-theme]` overrides (`blue` / `green` / `graphite`), ported
  1:1 from `input.css`.
- **Radius system**: System A (flat/minimal — `2px` controls, `3px`
  cards/modals), matching what the reference project's `input.css` actually
  ships.
- **Sidebar**: accordion sections (single-open), warm-light + gold active
  pill, mobile drawer with focus trap + Escape-to-close + `nav-mobile-hide`
  trim, theme-switcher popover — all from `gui-components/sidebar.md`. Not
  ported (out of this app's domain): "Widok administratora" owner-data
  toggles and nav pending-count badges (invoicing/appointments-specific).
- **Icons**: two systems, kept separate exactly as documented —
  `lib/icons/Icon.tsx` (filled glyphs) for general UI,
  `components/layout/NavIcon.tsx` (24×24 stroke) for sidebar nav only.
- **Confirm modal / toasts**: `useConfirm()`/`useToast()` reproduce
  `confirm_modal.html`'s and `notifications.js`'s visual + a11y contract.
  The original's dual "form-submit vs JS-callback" API collapses into a
  single promise-based hook — a necessary transport change, not a design one.

## Backend integration

Every page fetches real data through a typed client in `lib/api/`. The
backend's routes live under a few different prefixes, not one common `/api`
namespace — `vite.config.ts`'s dev-server proxy is scoped to match:

| Resource | Prefix | Notes |
|---|---|---|
| Auth | `/auth/*` | Session-cookie based (Flask-Login), JSON content-negotiated alongside the reference HTML routes — see `routes/auth/routes.py`. |
| Users | `/system/users/api` | `superuser`+`admin`; delete is `superuser`-only. |
| Roles | `/system/roles/api` | **`superuser`-only for every endpoint**, including read. The sidebar/router gate this on the literal role (`user.role === 'superuser'`), not the `settings` module — an admin has `settings` access for Users but the reference `roles_bp` never grants admins anything, so gating Roles on the module would show admins a link that 403s on every call. |
| Employees | `/employees/api` | `superuser`+`admin`; delete is `superuser`-only. New blueprint — the reference dump had the repository but no route layer for employees. |

`GET /auth/me` returns `{ user, permissions, is_supervisor,
has_linked_employee }` — the same inputs the reference `sidebar.html` used
server-side via Jinja context, now shipped as data. `AuthContext` fetches it
once on load and after login/logout; `ProtectedRoute` and the sidebar's
`navConfig.ts` both read from it, so there's no client-side copy of the RBAC
rules to drift out of sync with the server.

**Two small additions to the reference `routes/users/routes.py`** (not
present in the original dump, since it only shipped list/create/edit
HTML+JSON): `GET /system/users/api/<id>` (single-user fetch for the View/Edit
pages) and `GET /system/users/api/form-options` (roles + unlinked-employees
for the Create/Edit dropdowns). Roles' list endpoint already returns full
`permissions_detail` per role, so View/Edit there just filter the list
client-side rather than needing a matching single-role endpoint.

## Sidebar navigation

| Section | Page | Route | Gate |
|---|---|---|---|
| Zarządzanie | Pracownicy | `/employees` | `employees` module |
| | Formy zatrudnienia | `/employees/formy-zatrudnienia` | `employees` module (placeholder) |
| | Hierarchia pracowników | `/employees/hierarchy` | `employees` module (placeholder, see below) |
| | Nieobecności | `/absences` | `absences` module OR supervisor (placeholder) |
| | Bilanse urlopów | `/absences/balances` | `absences` module OR supervisor (placeholder) |
| | Moje nieobecności | `/absences/my` | linked employee record (placeholder) |
| System | Użytkownicy | `/users` | `settings` module (superuser + admin) |
| | Role | `/roles` | literal `superuser` role only — see table above |
| | Profil | `/profile` | any authenticated user |

## Employee hierarchy — implementation plan

`database/models.py` has a `#TODO-CLAUDE` comment on `EmployeeSupervisor`
asking for a proper org-chart model: hierarchy, levels, teams, management,
supervisor hierarchy, substitute definitions, job descriptions, skill
matrices. `/employees/hierarchy` is a placeholder summarizing this; the full
plan:

### Data model additions

| Entity | Purpose | Notes |
|---|---|---|
| `Department` | Org-chart node (team/department), `parent_id` self-FK | Tree structure independent of who-reports-to-whom |
| `JobLevel` | Junior/Mid/Senior/Lead/Manager, ordered rank | Drives approval thresholds & reporting, decoupled from `Employee.position` (which stays a free-text label) |
| `EmployeeSupervisor` (extend existing) | Add `relationship_type` (`direct` \| `dotted_line`), `effective_from`/`effective_to` | Today it's a flat M:M with no history — can't answer "who was Jan's manager in March?" (this build seeds one real row: Katarzyna Wiśniewska supervises two stylists, to exercise `is_supervisor()`) |
| `EmployeeSubstitute` | `employee_id`, `substitute_employee_id`, `scope` (`all` \| `absence_approvals` \| ...), date range | Distinct from supervision — a peer covering someone, not a manager |
| `JobDescription` | Versioned per `position` + `JobLevel` | Responsibilities/requirements text; new version on change, old one stays queryable |
| `SkillMatrix` / `DepartmentSkillRequirement` | `department_id`, `skill_name`, `required_level` vs. `EmployeeSkillRating` (skill × employee × level) | Feeds training-gap and shift-staffing reports |

### Suggested phased rollout

1. **Read-only org chart** — `Department` tree + existing `EmployeeSupervisor`
   rendered as a chart (a nested list is enough for v1; reach for a library
   like `react-d3-tree` only if a visual chart is required).
2. **Editable supervision** — assign/reassign supervisors with the new
   `effective_from`/`effective_to` fields; keep history instead of
   overwriting.
3. **Substitutes** — surface "who's covering X" on the absence-approval flow
   once `/absences` is implemented for real.
4. **Job descriptions + skill matrices** — lowest urgency; build once the
   above is stable and there's a concrete reporting need driving it.

### API shape

Follow the `routes/employees/routes.py` pattern already established:
`GET /employees/api/hierarchy` → nested tree, `POST /employees/api/:id/supervisor`
to reassign, `GET /employees/api/:id/substitutes` for the active-substitute
lookup, in a new `repositories/employees/hierarchy_repository.py`.

## Known gaps / next steps

- **Absences module** (`/absences`, `/absences/balances`, `/absences/my`) is
  still placeholder-only — out of this pass's scope. `repositories/absences/`
  exists in the reference dump; a route layer (mirroring `routes/employees/`)
  and matching frontend pages (mirroring `pages/employees/`) are the template
  to follow.
- **CSRF is disabled app-wide** for local dev (`app.py`,
  `WTF_CSRF_ENABLED = False`) — see `../BACKEND_SETUP.md`'s CSRF section for
  why and what production needs instead.
- No data-fetching/caching library (React Query, SWR) — `useApiData`/`useTableSort`
  are small hand-rolled hooks, fine at this data volume but worth swapping in
  once lists grow or need background refetch/optimistic updates.
- Roles' permission-matrix editor only toggles `has_access` per module; the
  `read_only`/`own_data`/`can_edit_price_history`/`can_send_sms` sub-flags
  exist in the backend and are preserved (not clobbered) on save, but have no
  UI to edit directly yet.
- `lib/icons/paths.ts` carries ~45 of the original 55 glyphs — the ones this
  app currently renders. Re-copy the rest from the reference
  `templates/components/icons.html` if a future page needs one that's
  missing (the dictionary lookup falls back to `info` for unknown names, so
  a missing icon fails visibly rather than crashing).
