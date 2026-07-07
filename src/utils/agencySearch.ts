import type { Agency } from '../App';
import type { ViewportBounds } from '../hooks/useIntervalStats';
import { AGENCY_CHIP_PAD } from '../../shared/config';

export function bboxInViewport(
  agency: { bbox?: [number, number, number, number]; center?: [number, number] },
  bounds: ViewportBounds | null,
): boolean {
  if (!bounds) return false;
  if (agency.bbox) {
    const [s, w, n, e] = agency.bbox;
    return s <= bounds.n && n >= bounds.s && w <= bounds.e && e >= bounds.w;
  }
  if (agency.center) {
    const [lat, lon] = agency.center;
    const pad = AGENCY_CHIP_PAD;
    return lat - pad <= bounds.n && lat + pad >= bounds.s && lon - pad <= bounds.e && lon + pad >= bounds.w;
  }
  return false;
}

function viewportCenter(bounds: ViewportBounds): [number, number] {
  return [(bounds.s + bounds.n) / 2, (bounds.w + bounds.e) / 2];
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMid = (lat1 + lat2) * Math.PI / 360;
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 40075000 * Math.cos(latMid) / 360;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface AgencySearchGroup {
  key: string;
  name: string;
  region: string;
  slug: string;
  inView: boolean;
  distanceM: number;
}

/** Match + dedupe agencies by display name, sort nearest/in-viewport first. */
export function searchAgencyGroups(
  agencies: Agency[],
  query: string,
  bounds: ViewportBounds | null,
  loadedSlugs?: Set<string>,
): AgencySearchGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [vLat, vLon] = bounds ? viewportCenter(bounds) : [null, null] as const;
  const raw = agencies.filter(a =>
    a.name.toLowerCase().includes(q)
    || a.slug.startsWith(q)
    || (a.region || '').toLowerCase().includes(q),
  );

  const byKey = new Map<string, {
    name: string;
    region: string;
    slugs: string[];
    inView: boolean;
    distanceM: number;
  }>();

  for (const a of raw) {
    const region = a.region ?? 'Other';
    const key = `${a.name}::${region}`;
    const inView = bboxInViewport(a, bounds);
    const [lat, lon] = a.center;
    const distanceM = vLat != null && vLon != null
      ? distanceMeters(lat, lon, vLat, vLon)
      : Infinity;

    const g = byKey.get(key);
    if (g) {
      g.slugs.push(a.slug);
      if (inView) g.inView = true;
      g.distanceM = Math.min(g.distanceM, distanceM);
    } else {
      byKey.set(key, { name: a.name, region, slugs: [a.slug], inView, distanceM });
    }
  }

  const loaded = loadedSlugs ?? new Set<string>();
  return [...byKey.values()]
    .map(g => {
      const inViewSlug = g.slugs.find(s => {
        const a = agencies.find(x => x.slug === s);
        return a && bboxInViewport(a, bounds);
      });
      const slug = g.slugs.find(s => loaded.has(s)) ?? inViewSlug ?? g.slugs[0];
      return {
        key: `${g.name}::${g.region}`,
        name: g.name,
        region: g.region,
        slug,
        inView: g.inView,
        distanceM: g.distanceM,
      };
    })
    .sort((a, b) => {
      if (a.inView !== b.inView) return a.inView ? -1 : 1;
      if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

/** Slugs to prefetch when searching — nearest matched agencies beyond the viewport. */
export function agencySlugsToPrefetchForSearch(
  agencies: Agency[],
  query: string,
  bounds: ViewportBounds | null,
  maxGroups = 25,
): string[] {
  return searchAgencyGroups(agencies, query, bounds).slice(0, maxGroups).map(g => g.slug);
}
