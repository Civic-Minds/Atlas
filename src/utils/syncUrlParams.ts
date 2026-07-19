/**
 * Merge query-param updates into the current URL via history.replaceState.
 * Always reads window.location at call time so multi-writer effects (day,
 * route, stop, map center) don't clobber each other via stale search strings.
 */

/** Pure merge for tests — returns the new search string without leading `?`. */
export function mergeUrlSearchParams(
  currentSearch: string,
  updates: Record<string, string | null | undefined>,
): string {
  const raw = currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch;
  const sp = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '') sp.delete(key);
    else sp.set(key, value);
  }
  return sp.toString();
}

/** Apply updates to the live URL (pathname preserved). */
export function syncUrlParams(updates: Record<string, string | null | undefined>): void {
  if (typeof window === 'undefined') return;
  const qs = mergeUrlSearchParams(window.location.search, updates);
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
}
