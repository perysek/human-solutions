# Forms UI Fixes — Implementation Plan

Source: Task 3 of the `/ui-ux-pro-max:ui-styling` forms audit — "all create/edit forms layout,
size, header buttons alignment, form title, form sub-title alignment — audit the current UI look
and make improvements for better look, consistency in form content width, alignment (preferred
center), font size, weight, spacing etc across all forms."

**Status: implemented and verified** (typecheck/lint clean, spot-checked in browser across
Training/Job/Skill/User/Worker/Role forms + `AlertThresholdsPage`). This document records the
audit findings and the fix applied to each, in the same format as `UI_IMPROVEMENTS_PLAN.md`, so
the reasoning is traceable if a future form needs the same treatment.

Scope: `TrainingForm`, `JobForm`, `SkillForm`, `UserForm`, `WorkerForm`, `RoleForm`, and
`AlertThresholdsPage` (a form-shaped settings page using the same primitives) — plus their
12 Create/Edit page wrappers.

---

## 1. Forms stretched full page width instead of a consistent, centered column — **M**

**Files:** `frontend/src/styles/components.css` (`.form-shell`, new `.form-page-shell`), all 12
Create/Edit page files + `AlertThresholdsPage.tsx`.

**Problem:** `.form-shell { width: 100%; max-width: 80rem; }` was applied directly to the `<form>`
element with no centering. On a normal desktop viewport the form-shell was effectively as wide as
`.refined-page` itself (~1200px+). This was fine for `WorkerForm` (6+ fields, benefits from a wide
multi-column grid), but for sparse forms (`JobForm`/`SkillForm`: 1–2 fields, `UserForm`: 4 fields
+ a checkbox) the result was a handful of ~230px-wide inputs floating in the top-left corner of a
huge, mostly-empty card — the auto-fit `.form-grid` (`minmax(200px, 1fr)`) doesn't stretch fields
to fill unused space once as many implicit tracks fit as there are real fields plus one collapsing
empty one. Screenshots confirmed the "Nowe stanowisko" and "Nowy użytkownik" forms in particular
looked broken/unfinished this way.

The `<form>` also wasn't wrapped with its `<PageHeader>`, so even if the form itself were narrowed
and centered, the title above it would stay flush-left while the form card centered independently
— a visible mismatch.

**Root cause:** width-capping only the `<form>`, not the page's title+form as one column, and no
centering at all (`margin` was never set on `.form-shell`).

**Fix applied:**
1. Added `.form-page-shell { width: 100%; max-width: 60rem; margin: 0 auto; }` in
   `components.css`, right after `.form-shell`. 60rem still gives `.form-grid` room for 3–4
   columns (verified `WorkerForm`'s "Dane podstawowe" fieldset lays out 4 fields per row, wrapping
   the remaining 2 to a second row — down from 5–6 in one row at 80rem, but no regression to the
   pre-existing single-column stacking the original 80rem change was written to avoid).
2. Wrapped `<PageHeader />` + the form (including its loading/error branches) in
   `<div className="form-page-shell">` on every Create/Edit page:
   `JobCreatePage.tsx`, `JobEditPage.tsx`, `SkillCreatePage.tsx`, `SkillEditPage.tsx`,
   `TrainingCreatePage.tsx`, `TrainingEditPage.tsx`, `UserCreatePage.tsx`, `UserEditPage.tsx`,
   `WorkerCreatePage.tsx`, `WorkerEditPage.tsx`, `RoleCreatePage.tsx`, `RoleEditPage.tsx`,
   `AlertThresholdsPage.tsx`. Title and form now share one column, same left/right edges.
3. Left `.form-shell`'s own `max-width: 80rem` on the `<form>` element unchanged (harmless —
   the parent `.form-page-shell` now constrains further) and updated its stale comment, which
   previously described the pre-wrapper rationale.
4. List/View pages (`WorkersListPage`, `JobViewPage`, `WorkerViewPage`, etc.) were **not**
   touched — this fix is scoped to Create/Edit forms only, per the audit's explicit target.

**Verification:** screenshotted every form before/after. `JobCreatePage`/`UserCreatePage` went
from a ~1200px card with a small cluster of fields and a large empty void to a proportionate
~960px centered card. `WorkerCreatePage`'s dense grid still reads as multi-column, not stacked.
`RoleCreatePage`'s permission-tile grid (`RolePermissionMatrix`, already its own responsive
`auto-fit` grid) still wraps cleanly at the narrower width. `tsc --noEmit` and `eslint` clean.

---

## 2. `TrainingForm` fields forced full-width for no reason — **S**

**Files:** `frontend/src/pages/trainings/TrainingForm.tsx`.

**Problem:** The "Nazwa" (single-line text) and, implicitly, layout around "Data szkolenia" fields
were marked `fullWidth`, which spans both `.form-grid` columns. At the old 80rem shell this made a
one-line text input render nearly 1200px wide — the single worst offender found in the audit.
Every other form's short text fields (`JobForm`'s "Identyfikator", `UserForm`'s "Email", etc.)
correctly omit `fullWidth` and size naturally via the grid.

**Root cause:** inconsistent use of the `fullWidth` prop — applied to a short single-line field
that has no reason to span the row, unlike the textareas in the same form (`Uwagi`, `Szczegóły
szkolenia`, `Dokumenty referencyjne`), which legitimately benefit from the extra width for
multi-line content.

**Fix applied:** removed `fullWidth` from the "Nazwa" `TextField`. "Data szkolenia" already had no
`fullWidth`; with "Nazwa" no longer full-width, the two now sit side by side in
`.form-grid`'s first row, matching the density of every other form's short fields. Textareas keep
`fullWidth`, unchanged.

**Verification:** screenshot of `/trainings/create` after the fix shows "Nazwa" and "Data
szkolenia" as two reasonably-sized fields in one row instead of "Nazwa" alone spanning the full
card width above a lone date picker.

---

## 3. Header/title/sub-title alignment across form pages — audited, no fix needed

**Files:** `frontend/src/components/ui/PageHeader.tsx`, all Create/Edit pages.

**Finding:** `PageHeader` is a single shared component (`page-title` / `page-subtitle` /
`page-header-actions` classes) already used identically across every List, View, Create, and Edit
page — font size (`1.75rem`/`600`), weight, and spacing were already consistent by construction,
nothing form-specific to fix. The only real alignment problem was the *positional* one covered in
item 1 (title anchored to the page's full width while the form card below it wasn't) — solved by
wrapping both in `.form-page-shell` together rather than by changing `PageHeader` itself.

No changes made here beyond the wrapping in item 1.

---

## 4. Font size / weight / spacing consistency across form fields — audited, no fix needed

**Files:** `frontend/src/components/ui/form.tsx` (`FieldWrapper`, `TextField`, `SelectField`,
`TextareaField`, `CheckboxField`, `FormSection`, `FormFieldset`, `FormActions`).

**Finding:** every form in scope (`JobForm`, `SkillForm`, `TrainingForm`, `UserForm`, `WorkerForm`,
`RoleForm`) already builds exclusively from this one shared primitive library — `.form-label`,
`.form-input`/`.form-select`/`.form-textarea`, `.form-legend`, `.form-btn-primary`/
`.form-btn-secondary` are all single CSS rules applied everywhere, so font sizes, weights, label
styling, required-asterisk styling, and helper/error text were already identical across every
form. The audit did not find a font-size/weight divergence to fix; the "content width, alignment"
findings above (items 1–2) were the actual sources of the inconsistent *look* the request
described. Confirmed this stays true after items 1–2's changes (no per-form style overrides were
introduced).

---

## Suggested sequencing (for reference — already completed in one pass)

Given the shared root cause (items 1 and 2 both stem from the same "no width/alignment contract
above `.form-shell`" gap), both were implemented together in a single session rather than
sequenced separately. Items 3–4 required no code change, only confirming the audit's other
concerns were already non-issues.
