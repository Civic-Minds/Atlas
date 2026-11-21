import type { Agency } from '../App';
import type { ViewportBounds } from '../hooks/useIntervalStats';
import { AGENCY_CHIP_PAD } from '../../shared/config';
import { compareAgencyName, compareSearchRelevance } from './sortCompare';
import { metresBetween } from '../../shared/geoDistance';
import { agencyGroupName, groupAgencies, groupHome } from '../../shared/agencyGroups';

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

export interface AgencySearchGroup {
  key: string;
  name: string;
  region: string;
  slug: string;
  inView: boolean;
  distanceM: number;
  cities?: string[];
  displayArea?: string;
  nameQualifier?: string;
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
  const matches = (a: Agency) => a.name.toLowerCase().includes(q)
    || a.slug.startsWith(q)
    || (a.region || '').toLowerCase().includes(q)
    || (a.searchAliases ?? []).some(alias => alias.toLowerCase().includes(q))
    || (a.cities ?? []).some(city => city.toLowerCase().includes(q));

  // One entry per agency or region (shared/agencyGroups.ts): a parent's feeds are one result under its name, found by its
  // own name or any member's.
  const loaded = loadedSlugs ?? new Set<string>();
  return groupAgencies(agencies)
    .filter(g => (g.parent && (g.parent.name.toLowerCase().includes(q) || g.parent.slug.startsWith(q))) || g.members.some(matches))
    .map(g => {
      const home = groupHome(g);
      const name = agencyGroupName(g, a => a.name);
      const region = home.region ?? 'Other';
      const distanceM = vLat != null && vLon != null
        ? Math.min(...g.members.map(a => metresBetween({ lat: a.center[0], lon: a.center[1] }, { lat: vLat, lon: vLon })))
        : Infinity;
      const inViewSlug = g.members.find(a => bboxInViewport(a, bounds))?.slug;
      const slug = g.members.find(a => loaded.has(a.slug))?.slug ?? inViewSlug ?? home.slug;
      return {
        key: `${name}::${region}`,
        name,
        region,
        slug,
        inView: inViewSlug !== undefined,
        distanceM,
        cities: home.cities,
        displayArea: home.displayArea,
        ...(g.parent ? {} : { nameQualifier: home.nameQualifier }),
      };
    })
    .sort((a, b) => compareSearchRelevance(a, b, (x, y) => compareAgencyName(x.name, y.name) || x.region.localeCompare(y.region)));
}

/** Max agency rows in the search dropdown. */
export const SEARCH_AGENCY_DISPLAY_LIMIT = 10;

export interface AgencySearchDisplay {
  groups: AgencySearchGroup[];
  totalMatches: number;
  truncated: boolean;
}

export function prepareAgencyGroupsForDisplay(
  groups: AgencySearchGroup[],
  limit = SEARCH_AGENCY_DISPLAY_LIMIT,
): AgencySearchDisplay {
  const totalMatches = groups.length;
  const truncated = totalMatches > limit;
  return {
    groups: truncated ? groups.slice(0, limit) : groups,
    totalMatches,
    truncated,
  };
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
