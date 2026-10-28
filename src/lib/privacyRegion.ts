/**
 * The visitor's country for the consent prompt (/api/privacy-region), remembered in this browser for 30 days so a
 * repeat visit makes no request to Vercel (CIV-977). Storage that throws or is empty falls back to the request.
 */
const KEY = 'atlas.privacyRegion';
export const PRIVACY_REGION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function remembered(now: number): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const { country, at } = JSON.parse(raw) as { country?: unknown; at?: unknown };
    return typeof country === 'string' && /^[A-Z]{2}$/.test(country) && typeof at === 'number' && now - at >= 0 && now - at < PRIVACY_REGION_MAX_AGE_MS
      ? country
      : null;
  } catch {
    return null;
  }
}

function remember(country: string, now: number): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ country, at: now }));
  } catch {
    // Private windows and blocked storage: the next visit asks again.
  }
}

/** The two-letter country ('XX' when unknown); rejects when the request fails, as the fetch it replaces did. */
export async function privacyRegionCountry(now = Date.now()): Promise<string> {
  const known = remembered(now);
  if (known) return known;
  const response = await fetch('/api/privacy-region');
  if (!response.ok) throw new Error(`privacy-region ${response.status}`);
  const { country } = await response.json() as { country?: string };
  const value = country ?? 'XX';
  // An unknown country is not remembered, so a later visit can still learn it.
  if (/^[A-Z]{2}$/.test(value) && value !== 'XX') remember(value, now);
  return value;
}
