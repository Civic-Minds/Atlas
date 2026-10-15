import { useEffect, useRef } from 'react';

/**
 * Save a filter value as the viewer's preference, except while it is still the value a shared
 * link supplied. Opening someone's link (?h=10, ?span=0, ?day=Saturday) applies to this visit
 * only; the saved preference changes once the viewer picks a different value, like the agency
 * selection rule (CIV-72). Without a link value, every value is saved, as before.
 */
export function usePersistedFilterPref(storageKey: string, value: string, fromUrl: boolean): void {
  // The first render's value is the one the link supplied. A ref, not "skip the first run",
  // so StrictMode's repeated effects in development still skip it.
  const urlValueRef = useRef<string | null>(fromUrl ? value : null);
  useEffect(() => {
    if (urlValueRef.current !== null) {
      if (value === urlValueRef.current) return;
      urlValueRef.current = null;
    }
    try { localStorage.setItem(storageKey, value); } catch {}
  }, [storageKey, value]);
}
