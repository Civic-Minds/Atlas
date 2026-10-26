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

/** Pure read for tests: a param's value, or null when it is missing or empty (empty is what a sync deletes). */
export function readUrlSearchParam(currentSearch: string, key: string): string | null {
  const value = new URLSearchParams(currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch).get(key);
  return value == null || value === '' ? null : value;
}

/** Pure read for tests: a param as a number, or null when it is missing, empty or not a number. */
export function readUrlSearchNumber(currentSearch: string, key: string): number | null {
  const value = readUrlSearchParam(currentSearch, key);
  return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}

/** Read a param from the live URL (the read half of syncUrlParams); null outside the browser. */
export function readUrlParam(key: string): string | null {
  return typeof window === 'undefined' ? null : readUrlSearchParam(window.location.search, key);
}

/** Read a numeric param from the live URL; null outside the browser. */
export function readUrlNumberParam(key: string): number | null {
  return typeof window === 'undefined' ? null : readUrlSearchNumber(window.location.search, key);
}

/** Apply updates to the live URL (pathname preserved). */
export function syncUrlParams(updates: Record<string, string | null | undefined>): void {
  if (typeof window === 'undefined') return;
  const qs = mergeUrlSearchParams(window.location.search, updates);
  window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
}
