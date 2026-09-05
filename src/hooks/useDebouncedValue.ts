import { useEffect, useState } from 'react';

/**
 * Debounces a value with a plain setTimeout instead of useDeferredValue.
 *
 * useDeferredValue can be starved indefinitely by other state updates
 * elsewhere in the render tree (confirmed live on Atlas's search box: it sat
 * frozen behind its old value for 10+ seconds with no other input, never
 * catching up -- see issue #495). A timeout always fires on its own schedule
 * regardless of what else is re-rendering.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
