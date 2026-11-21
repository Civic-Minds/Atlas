import { metresBetween } from '../../shared/geoDistance';
const KEY = 'atlas_studio_agency';

/** CIV-1883: the agency Studio was last on, kept in this browser so Studio reopens on it (storage can be blocked: null then). */
export function getSavedStudioAgency(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function saveStudioAgency(slug: string): void {
  try { localStorage.setItem(KEY, slug); } catch { /* private window or blocked storage: Studio just opens on its default */ }
}

/**
 * The Studio agency the map is on (#1660): of the listed agencies whose area holds the map's centre from the address
 * (?lat=&lon=), the one whose own centre is nearest, else null. The catalog's areas are coarse boxes around each centre
 * (Guelph's box holds Hamilton's downtown), so the nearest centre decides, not the smallest box: a map on Hamilton opens
 * Hamilton, on Toronto TTC (not YRT), on Guelph Guelph. An address without an agency opens on this before the remembered one.
 */
export function studioAgencyInView(
  search: string,
  agencies: ReadonlyArray<{ slug: string; bbox?: [number, number, number, number]; center?: [number, number] }>,
  listed: ReadonlySet<string>,
): string | null {
  const q = new URLSearchParams(search);
  const lat = Number(q.get('lat')), lon = Number(q.get('lon'));
  if (!q.get('lat') || !q.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: { slug: string; d: number } | null = null;
  for (const a of agencies) {
    if (!a.bbox || !a.center || !listed.has(a.slug)) continue;
    const [s, w, n, e] = a.bbox;
    if (lat < s || lat > n || lon < w || lon > e) continue;
    const d = metresBetween({ lat, lon }, { lat: a.center[0], lon: a.center[1] });
    if (!best || d < best.d) best = { slug: a.slug, d };
  }
  return best?.slug ?? null;
}
