import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` has
 * passed without a further change — the timer resets on every intermediate
 * change. Used to keep a search `<input>` feeling instant (raw value drives
 * the input) while the *debounced* value drives the actual API call, so
 * typing doesn't fire one fetch per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debounced;
}
