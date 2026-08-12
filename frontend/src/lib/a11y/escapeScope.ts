/**
 * Coordinates who "owns" the Escape key at any moment. A page-level Escape
 * binding (Cancel / back-to-list) and a component-level one (confirm dialog,
 * theme-switcher popover, column-filter dropdown) can be mounted at the same
 * time — without this, opening the theme switcher while editing a form and
 * pressing Escape would close the popover AND navigate away from the form in
 * the same keystroke. "One Escape closes one layer" (same principle already
 * used for the mobile sidebar drawer) — the innermost open layer claims the
 * scope while it's open; anything listening for page-level Escape checks
 * `isEscapeClaimed()` first and backs off if something more specific is
 * already handling it.
 */
let depth = 0;

export function claimEscape(): () => void {
  depth++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
  };
}

export function isEscapeClaimed(): boolean {
  return depth > 0;
}
