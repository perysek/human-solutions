import type { ReactNode } from 'react';
import { Icon } from '@/lib/icons/Icon';

/**
 * Positioning shell for every native <select> in the app — adds a static,
 * right-aligned expand_more icon (a plain "this is a dropdown" affordance,
 * not an animated open/closed indicator like the custom popover dropdowns —
 * a native <select> never reports real open/closed state to the DOM, so any
 * animation tied to it is at best a heuristic and looked broken in practice).
 *
 * Defaults to block/100%-width, matching .form-select's own intrinsic width
 * (form fields, inline "add row" pickers). Pass `inline` for a select that
 * must shrink to its content instead — e.g. sitting next to a search input
 * in a flex row, or a compact table-footer page-size picker.
 */
export function SelectWrap({ children, inline }: { children: ReactNode; inline?: boolean }) {
  return (
    <div className={`select-wrap ${inline ? 'select-wrap-inline' : ''}`.trim()}>
      {children}
      <Icon name="expand_more" size={14} className="select-wrap-chevron" />
    </div>
  );
}
