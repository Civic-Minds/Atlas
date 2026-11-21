const KEY = 'atlas_studio_agency';

/** CIV-1883: the agency Studio was last on, kept in this browser so Studio reopens on it (storage can be blocked: null then). */
export function getSavedStudioAgency(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function saveStudioAgency(slug: string): void {
  try { localStorage.setItem(KEY, slug); } catch { /* private window or blocked storage: Studio just opens on its default */ }
}

/**
 * The Studio agency the map is on (#1660): the listed agency whose area holds the map's
 * centre from the address (?lat=&lon=), the smallest when areas overlap (TTC inside YRT's), else null. An address
 * without an agency opens on this before the remembered one, so a map on Toronto never jumps to Hamilton.
 */
export function studioAgencyInView(
  search: string,
  agencies: ReadonlyArray<{ slug: string; bbox?: [number, number, number, number] }>,
  listed: ReadonlySet<string>,
): string | null {
  const q = new URLSearchParams(search);
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
  if (!q.get('lat') || !q.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: { slug: string; area: number } | null = null;
  for (const a of agencies) {
    if (!a.bbox || !listed.has(a.slug)) continue;
    const [s, w, n, e] = a.bbox;
    if (lat < s || lat > n || lon < w || lon > e) continue;
    const area = (n - s) * (e - w);
    if (!best || area < best.area) best = { slug: a.slug, area };
  }
  return best?.slug ?? null;
}
