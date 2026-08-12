import { useEffect } from 'react';
import { isEscapeClaimed } from './escapeScope';

/**
 * Page-level Escape binding — "Anuluj" / go back to the previous view.
 * Escape is a control key, not a character key, so it's exempt from WCAG
 * 2.1.4 (Character Key Shortcuts) and safe to bind globally without a way
 * to remap/disable it. Skips firing when a modal/popover/dropdown has
 * claimed the key via useEscapeClaim — see escapeScope.ts.
 */
export function useEscapeAction(action: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (isEscapeClaimed()) return;
      action();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [action, enabled]);
}
