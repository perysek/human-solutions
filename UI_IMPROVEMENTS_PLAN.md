# UI Improvements — Implementation Plan

Source: UI/UX audit of `frontend/src` (design tokens, `PaginatedTable`, `SearchableSelect`,
`ToastProvider`, `Sidebar`, `AppShell`, `WorkersListPage`, `useApiData`). Each item below lists
the affected files, the concrete change, and why it's worth doing. Ordered by impact; items 1–3
share one root cause (the search → fetch → re-render flow) and should be done together.

Effort legend: **S** < 30 min, **M** 30–90 min, **L** half day+.

---

## 1. Debounce list-page search inputs — **M**

**Files:** `frontend/src/pages/workers/WorkersListPage.tsx` (and the equivalent search inputs in
Trainings/Skills/Jobs list pages), new hook `frontend/src/lib/useDebouncedValue.ts`.

**Problem:** `onChange` writes straight into `useApiData`'s dependency array, so every keystroke
triggers a fetch and flashes `<TableSkeleton>` (loading is set synchronously in
`useApiData.ts:20`).

**Steps:**
1. Add `useDebouncedValue<T>(value: T, delayMs = 300): T` — a small `useState` + `useEffect` +
   `setTimeout` hook, cleared on every value change.
2. In each list page, keep the raw input value in local `search` state (so typing feels instant)
   and pass a *debounced* copy into `useApiData`'s deps / API call:
   ```tsx
   const [search, setSearch] = useState('');
   const debouncedSearch = useDebouncedValue(search, 300);
   const { data, loading, error } = useApiData(
     () => workersApi.list({ ...otherParams, search: debouncedSearch || undefined }),
     [status, debouncedSearch, sortKey, sortOrder, page],
   );
   ```
3. Reset to page 1 off the *debounced* value's effect, not the raw `onChange`, so the page reset
   doesn't fire mid-typing.
4. Roll the same pattern into every other list page with a live search box.

**Verification:** type a name quickly in DevTools' Network tab — should see one request ~300ms
after the last keystroke, not one per character. Table should not flash on every letter.

---

## 2. Fix table horizontal overflow on mobile — **S**

**Files:** `frontend/src/styles/components.css` (`.table-container`, `.table-scroll-body`).

**Problem:** `.table-container { overflow: hidden }` (line ~354) and `.table-scroll-body` only
sets `overflow-y: auto` — no `overflow-x` anywhere in the codebase. Columns that can't shrink
below their content width (badges, dates, the "Akcje" button) get silently clipped off-screen on
narrow viewports instead of becoming reachable.

**Steps:**
1. Add `overflow-x: auto` to `.table-scroll-body` in `components.css`.
2. Optionally add `-webkit-overflow-scrolling: touch;` for smoother momentum scroll on iOS.
3. Sanity-check `.refined-table` doesn't need `min-width` per column to avoid overly aggressive
   squishing before the scrollbar kicks in (a `min-width: 640px` on `.refined-table` inside the
   scroll body is a reasonable floor).
4. Re-test the existing `@media (max-width: 640px) { .stats-grid { display: none; } }` block
   still reads fine now that the table itself scrolls independently.

**Verification:** resize the browser (or a real phone) to 375px width on any list page — every
column, including row actions, should be reachable via horizontal swipe/scroll, never invisible.

---

## 3. Announce search-result changes to screen readers — **S**

**Files:** `frontend/src/components/ui/PaginatedTable.tsx` (table-footer count span), the
loading/empty/results conditional block in each list page (e.g. `WorkersListPage.tsx:118-124`).

**Problem:** The "X–Y z Z wyników" count and the skeleton→results swap aren't in an `aria-live`
region, so a screen-reader user gets no non-visual confirmation a search ran or how many results
came back.

**Steps:**
1. Wrap the results/table area in a container with `aria-live="polite"` and
   `aria-atomic="true"` — reuse the pattern already correct in `ToastProvider.tsx:71`
   (`<div ... aria-live="polite">`).
2. Simplest approach: put `aria-live="polite"` on the table-footer's row-count `<span>` in
   `PaginatedTable.tsx` (it already re-renders whenever `totalItems` changes) rather than the
   whole table, to avoid over-announcing full table markup.
3. Confirm the announcement doesn't fire on every keystroke once item 1 (debounce) is in —
   otherwise a screen reader would still get spammed.

**Verification:** with a screen reader on (NVDA/VoiceOver), type a search term and confirm the
result count is announced once, after the debounce settles.

---

## 4. Wire up the existing (unused) search-clear button — **S**

**Files:** `frontend/src/pages/workers/WorkersListPage.tsx` (and other list pages' search boxes),
`frontend/src/styles/components.css` (`.search-clear-btn`, already styled at lines ~311–331).

**Problem:** `.search-clear-btn` is fully designed in CSS (position, hover, `.visible` toggle)
but never rendered in any `.tsx` file — dead CSS, missing affordance.

**Steps:**
1. Create a small shared `<SearchInput>` component (or inline the pattern) wrapping
   `.search-input-wrap`:
   ```tsx
   <div className="search-input-wrap">
     <input className="refined-input" value={search} onChange={...} />
     <button
       type="button"
       className={`search-clear-btn ${search ? 'visible' : ''}`}
       aria-label="Wyczyść wyszukiwanie"
       onClick={() => setSearch('')}
     >
       <Icon name="close" size={14} />
     </button>
   </div>
   ```
2. Swap this into every list page currently hand-rolling `.search-input-wrap` (Workers,
   Trainings, Skills, Jobs, Users, Roles) so the fix lands everywhere at once instead of
   per-page.

**Verification:** typing text in a search box reveals an "×" button; clicking it clears the
field and refocuses it.

---

## 5. Pause toast auto-dismiss on hover/focus — **S**

**Files:** `frontend/src/lib/feedback/ToastProvider.tsx`.

**Problem:** `window.setTimeout` (line ~47) dismisses a toast on a fixed timer with no
hover/focus pause, and `MAX_STACKED = 3` can push an unread older toast off the stack entirely.

**Steps:**
1. Track each toast's remaining time / a `paused` flag, or simpler: store the timeout ID per
   toast and clear it `onMouseEnter`, restart a fresh (shorter, e.g. 2s) timer `onMouseLeave`.
   ```tsx
   <div
     className={`toast-${t.type}`}
     role="status"
     onMouseEnter={() => t.timeoutId && window.clearTimeout(t.timeoutId)}
     onMouseLeave={() => scheduleReDismiss(t.id)}
   >
   ```
2. Apply the same pause on `:focus-within` (a keyboard user tabbing to the dismiss button)
   for parity — not just mouse users.
3. Keep the existing `MAX_STACKED = 3` behavior, but this alone reduces the odds an important
   toast gets dropped by a burst of new ones while the user is still reading it.

**Verification:** trigger a toast, hover over it before the 4s timer expires — it should stay
visible until the mouse leaves, then dismiss shortly after.

---

## 6. Add keyboard navigation to `SearchableSelect`'s option list — **M**

**Files:** `frontend/src/components/ui/SearchableSelect.tsx`.

**Problem:** The popover uses `role="listbox"` / `role="option"` (implying arrow-key support per
ARIA authoring practices) but only has `onClick` handlers — no `ArrowDown`/`ArrowUp`/`Enter`.

**Steps:**
1. Add an `activeIndex` state, reset to `0` (or `-1`) whenever `filtered` changes.
2. On the search `<input>`'s `onKeyDown`, handle:
   - `ArrowDown` / `ArrowUp` → move `activeIndex` within `filtered.length`, clamped.
   - `Enter` → commit `filtered[activeIndex]` via the existing `onChange`/`setOpen(false)` path.
   - `Escape` already closes the popover (existing `onEscape` handler) — keep as-is.
3. Reflect `activeIndex` visually (e.g. `background: var(--color-surface)` on the active option,
   matching the existing selected-option style) and set `aria-activedescendant` on the input
   pointing at the active option's `id` for screen-reader parity.
4. Scroll the active option into view (`scrollIntoView({ block: 'nearest' })`) as it changes.

**Verification:** open the "Szkolenie" picker in `ActionPlanModal`, type to filter, then use
arrow keys + Enter to select without touching the mouse.

---

## 7. Add a hover-reveal affordance icon to clickable table rows — **S**

**Files:** `frontend/src/pages/workers/WorkersListPage.tsx` (and any other list page with
row-click navigation), `frontend/src/styles/components.css`.

**Problem:** Clickable rows (`WorkersListPage.tsx:145-153`) only signal clickability via
`cursor: pointer` + hover background — invisible on touch devices, easy to miss on desktop.

**Steps:**
1. Add a trailing cell (or absolutely-positioned icon in the last cell) with a `chevron_right`
   icon, styled like the existing `.action-icon-btn.danger-reveal` reveal-on-hover pattern:
   ```css
   .row-nav-hint {
     opacity: 0;
     transform: translateX(-4px);
     transition: opacity 0.2s var(--ease-out-expo), transform 0.2s var(--ease-out-expo);
   }
   tr:hover .row-nav-hint, tr:focus-within .row-nav-hint { opacity: 0.5; transform: none; }
   ```
2. On touch/coarse-pointer devices (`@media (hover: none)`), show it at a permanent low opacity
   instead of relying on hover, since there's no hover state to reveal it.

**Verification:** hovering/focusing a row reveals a subtle chevron; on a phone the chevron is
always faintly visible so tappability is obvious without hovering.

---

## 8. Replace the placeholder brand identity — **L** (design-dependent)

**Files:** `frontend/src/components/layout/Sidebar.tsx:83-90`,
`frontend/src/components/layout/AppShell.tsx:71-77`, `frontend/public/`.

**Problem:** Both files carry comments explaining the original salon logo was stripped and never
replaced — currently plain text ("System Kadrowy") stands in for the brand mark everywhere.

**Steps:**
1. This is the one item that needs an actual asset, not just code — either commission/generate a
   simple wordmark+icon or confirm with stakeholders that text-only is the permanent design
   (in which case, treat the plain text more intentionally: proper type scale/weight rather than
   a leftover placeholder — see the `.refined-title` styling already used elsewhere for
   inspiration).
2. Once an asset exists, drop it in `frontend/public/logo.webp` (full, sidebar header) and
   `frontend/public/logo-inline.webp` (condensed, mobile header) — the exact filenames the
   removed `<img>` tags previously referenced per the code comments.
3. Re-add the `<img>` elements in both files, keeping `--sidebar-logo-filter` (already defined in
   `tokens.css`) for the dark-sidebar-needs-inverted-logo case.

**Verification:** sidebar (desktop) and condensed header (mobile) both show a real mark instead
of plain text, and it inverts correctly under the espresso-dark sidebar theme.

---

## 9. Add a spinner to form submit loading state — **S**

**Files:** `frontend/src/components/ui/form.tsx` (`FormActions`),
`frontend/src/styles/components.css`.

**Problem:** `isLoading` only swaps button text to "Zapisywanie…" (line ~176) — no visual motion,
easy to miss on a slow connection, risks duplicate-click submissions.

**Steps:**
1. Add a small inline spinner (reuse the existing shimmer/rotation idiom already in the codebase
   rather than introducing a new one):
   ```css
   .btn-spinner {
     width: 0.875rem; height: 0.875rem; border-radius: 50%;
     border: 2px solid currentColor; border-top-color: transparent;
     animation: btn-spin 0.6s linear infinite;
   }
   @keyframes btn-spin { to { transform: rotate(360deg); } }
   @media (prefers-reduced-motion: reduce) { .btn-spinner { animation: none; } }
   ```
2. Render it conditionally in `FormActions`:
   ```tsx
   <button type="submit" className="form-btn-primary" disabled={isLoading}>
     {isLoading && <span className="btn-spinner" aria-hidden="true" />}
     {isLoading ? 'Zapisywanie…' : submitLabel}
   </button>
   ```
3. `disabled` already prevents double-submits — the spinner just makes the "in progress" state
   unambiguous.

**Verification:** submit any form on a throttled network (DevTools "Slow 3G") — button shows a
spinning ring next to the text the whole time it's disabled.

---

## 10. Reconcile touch targets + form field density on narrow screens — **M**

**Files:** `frontend/src/styles/components.css` (`.form-input`/`.form-select`,
`.refined-input`, `.action-icon-btn`), audit pass across form pages.

**Problem:** Not directly observed as broken, but flagged during the audit as a follow-up check:
`.action-icon-btn` is `2rem` (32px) — under the 44px touch target guideline — and several inputs
use `padding: 0.5rem 0.75rem` which is comfortably above 16px font-size (good, avoids iOS zoom
per the existing `base.css:29-40` guard) but worth confirming tap-target *area*, not just font
size, on the densest pages (e.g. the permission matrix, which already correctly uses
`min-height: 44px` per `components.css:683` as the reference pattern).

**Steps:**
1. Audit `.action-icon-btn` (`components.css` ~line 520) and any other icon-only interactive
   element under 44×44px; on touch-capable viewports, expand the hit area (not necessarily the
   visual size) via padding or a pseudo-element, following the `.permission-tile` pattern already
   established.
2. Spot-check the densest real page (Worker edit form, permission matrix) at 375px width for any
   cramped or overlapping tap targets.

**Verification:** on a real phone, every icon-only button (edit, delete, pagination arrows) is
comfortably tappable without mis-hits on adjacent controls.

---

# Bonus: 5 Highest-Impact Animation/Transition Additions

These build on patterns *already established* in `components.css` (view-transitions, staggered
fade-ups, `--ease-out-expo`/`--ease-out-quart` tokens, `prefers-reduced-motion` guards everywhere)
rather than introducing a new motion language — consistency is what makes motion feel
intentional instead of decorative.

## A. Staggered entrance for stat cards and dashboard tiles — **S**

**Files:** `frontend/src/components/ui/StatCard.tsx`, any dashboard grid consuming it.

The `.stagger-item` utility with per-child `animation-delay` already exists
(`components.css:888-898`) and is used elsewhere, but `StatCard` itself doesn't opt in.

```tsx
<div className="stat-card stagger-item" style={{ animationDelay: `${index * 40}ms` }}>
```

**Why it lands:** dashboard stat rows currently pop in all at once (or not at all); a subtle
40–60ms cascade makes the page feel considered rather than dumped on screen, matching the same
cascade already used for table rows (`row-enter` keyframe, `components.css:427-430`).

## B. Number count-up on `StatCard` values — **M**

**Files:** `frontend/src/components/ui/StatCard.tsx`, new small hook
`frontend/src/lib/useCountUp.ts`.

Animate `stat-value` from 0 (or its previous value) to the new number over ~500ms using
`requestAnimationFrame` + an eased interpolation (reuse `--ease-out-expo`), respecting
`prefers-reduced-motion` (skip straight to the final value).

**Why it lands:** static numbers on a dashboard read as inert; a brief count-up on load/refresh
draws the eye to exactly the data that changed, reinforcing "this is live data" — a classic,
low-cost dashboard signature moment.

## C. Shared-element transition between list row and detail view — **L**

**Files:** `frontend/src/pages/workers/WorkersListPage.tsx`,
`frontend/src/pages/workers/WorkerViewPage.tsx`, `components.css` (view-transition block,
~lines 936–947).

The app already uses the View Transitions API for sidebar-link and main-content cross-fades
(`components.css:936-947`). Extend the same `view-transition-name` idiom to the clicked row's
name cell and the detail page's `<h1>`, so navigating from "Kowalski, Jan" in the table to the
worker's profile page morphs the text into place instead of a hard cross-fade.

```tsx
// list row cell
<td style={{ viewTransitionName: `worker-name-${w.id}` }}>{w.surname} {w.firstname}</td>
// detail page heading
<h1 style={{ viewTransitionName: `worker-name-${worker.id}` }}>{worker.fullName}</h1>
```

**Why it lands:** this is the single highest "wow, that felt expensive" moment available for the
lowest additional infrastructure cost, since the transition machinery is already wired up — it
just isn't targeted at the one element (the row you clicked) users are actually tracking with
their eyes.

## D. Success "pulse" on inline status changes (badges, checkmarks) — **S**

**Files:** `frontend/src/styles/components.css` (`.status-badge`), wherever a status/badge value
changes in place (e.g. action plan completion, training status toggles).

The permission-tile check already has a nice reference implementation
(`tile-check-pop` keyframe, `components.css:695-705`) — port the same "settle" pop to
`.status-badge` when its value changes:

```css
.status-badge.just-changed { animation: tile-check-pop 0.25s var(--ease-out-quart); }
```
Toggle the `just-changed` class briefly (e.g. via a `useEffect` keyed on the status value,
removed after the animation duration) whenever a badge's underlying value updates.

**Why it lands:** right now a status flip (e.g. marking a training complete) is indistinguishable
from a page re-render — a brief pop draws the eye to confirm "yes, that action registered,"
closing the same feedback gap as item 9's spinner but for in-place state changes instead of
form submits.

## E. Directional page-content transition tied to navigation depth — **M**

**Files:** `components.css` (`#main-content` view-transition block, lines 943-947),
`AppShell.tsx`.

Currently every route change uses the same fade (`sidebar-vt-in`/`sidebar-vt-out`). Differentiate
"drilling in" (list → detail, e.g. `/workers` → `/workers/:id`) from "backing out" using a tiny
directional slide, driven by comparing path depth on navigation:

```css
.vt-forward { view-transition-name: main-content; }
::view-transition-new(main-content).vt-forward { animation: slide-in-right 0.22s var(--ease-out-expo) both; }
::view-transition-new(main-content).vt-back { animation: slide-in-left 0.22s var(--ease-out-expo) both; }
```

Toggle a class on `<html>` (or via the View Transition's `types` option) based on whether the new
path is longer or shorter than the previous one, inside `AppShell.tsx`'s existing route-change
`useEffect` (`AppShell.tsx:36-42`).

**Why it lands:** directional motion is one of the strongest "this app has real information
architecture" signals — it reinforces the mental model of moving *into* a record vs. *back out*
to a list, at essentially zero extra cost since the cross-fade infrastructure already exists;
this only adds direction to it. Keep it subtle (short duration, small offset) so it reads as
polish, not a slide-heavy mobile-app feel — and it must respect the existing
`prefers-reduced-motion` block (`components.css:949-959`), same as every other transition here.

---

## Suggested sequencing

1. **Session 1 (search flow, ~2h):** items 1, 2, 3, 4 — fixes the shared search→fetch→render path
   used by every list page at once.
2. **Session 2 (feedback & keyboard, ~1.5h):** items 5, 6, 9 — toast pause, combobox keys, submit
   spinner.
3. **Session 3 (polish, ~1h):** items 7, 10 — row affordance + touch-target audit.
4. **Session 4 (needs an asset, schedule separately):** item 8 — brand logo.
5. **Session 5 (animation bonus, pick 2-3 to start, ~1.5h):** A and D are cheapest and highest
   ratio of visible delight to effort; C is the standout "wow" moment but costs the most time —
   good candidate for its own dedicated session once A/B/D/E are proven out.
