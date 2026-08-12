import { useEffect } from 'react';
import { claimEscape } from './escapeScope';

/**
 * Call from any dismissible layer (modal, popover, dropdown) with its own
 * `open`/`isOpen` state. While `active` is true, this layer claims the
 * Escape key so page-level navigation (useEscapeAction) won't also fire —
 * the layer's own Escape-to-close handler still needs to exist separately;
 * this only reserves the key, it doesn't handle closing.
 */
export function useEscapeClaim(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const release = claimEscape();
    return release;
  }, [active]);
}
