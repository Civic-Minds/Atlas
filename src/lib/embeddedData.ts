/** A prerendered page's own data, from the <script type="application/json" id=...> the prerender embedded next to the app root; null when absent or unreadable. */
export function readEmbeddedJson<T>(id: string): T | null {
  if (typeof document === 'undefined') return null;
  try {
    const raw = document.getElementById(id)?.textContent;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
