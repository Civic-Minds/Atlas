/**
 * Developer hints (rebuild commands in the page, console notes) show only when asked for: `?dev=1` in the URL, or
 * localStorage 'atlas.devHints' = '1'. Never by default, not even in a dev build, so every review looks like the real page.
 */
export function devHintsOn(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    if (new URLSearchParams(window.location.search).get('dev') === '1') return true;
  } catch { /* no window */ }
  try {
    return window.localStorage.getItem('atlas.devHints') === '1';
  } catch { return false; }
}
