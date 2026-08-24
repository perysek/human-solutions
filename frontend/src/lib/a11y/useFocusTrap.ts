import { useEffect } from 'react';

/**
 * Traps Tab focus inside `containerRef` while `active` is true, and returns
 * focus to `returnFocusRef` on deactivation. Shared by the mobile sidebar
 * drawer and the confirm modal — both overlay UI that must not leak
 * keyboard focus to the page behind them (WCAG 2.4.3).
 */
export function useFocusTrap(
  active: boolean,
  containerRef: React.RefObject<HTMLElement>,
  returnFocusRef?: React.RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    // Captured now, not read fresh inside the cleanup closure below — by the
    // time cleanup runs, returnFocusRef.current may already point at a
    // different (or null) node if the ref target re-rendered in between.
    const elementToRefocus = returnFocusRef?.current;

    function getFocusable(): HTMLElement[] {
      if (!container) return [];
      return Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
        (el) => el.offsetParent !== null,
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      elementToRefocus?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
