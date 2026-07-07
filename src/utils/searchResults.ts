import type { GeoJSON } from 'geojson';
import type { ShapeProperties } from '../hooks/useAgencyData';
import type { ViewportBounds } from '../hooks/useIntervalStats';
import type { AgencySearchGroup } from './agencySearch';

export interface RouteSearchResult {
  key: string;
  routeShortName: string | null;
  routeLongName: string | null;
  agencyName?: string;
  inView: boolean;
  distanceM: number;
  matchRank: number;
}

export interface SplitSearchResults<T> {
  inView: T[];
  elsewhere: T[];
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

function featureBbox(f: GeoJSON.Feature): [number, number, number, number] {
  if (f.geometry.type === 'Point') {
    const [lon, lat] = f.geometry.coordinates;
    return [lon, lat, lon, lat];
  }
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const coords = f.geometry.type === 'LineString'
    ? f.geometry.coordinates
    : f.geometry.type === 'MultiLineString'
      ? f.geometry.coordinates.flat()
      : [];
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function featureInViewport(f: GeoJSON.Feature, bounds: ViewportBounds): boolean {
  const [minLon, minLat, maxLon, maxLat] = featureBbox(f);
  return maxLon >= bounds.w && minLon <= bounds.e && maxLat >= bounds.s && minLat <= bounds.n;
}

function featureDistanceM(f: GeoJSON.Feature, bounds: ViewportBounds | null): number {
  if (!bounds) return Infinity;
  const [minLon, minLat, maxLon, maxLat] = featureBbox(f);
  const [vLat, vLon] = viewportCenter(bounds);
  const lat = (minLat + maxLat) / 2;
  const lon = (minLon + maxLon) / 2;
  return distanceMeters(lat, lon, vLat, vLon);
}

const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || '0';

/** True when the query looks like a route number/code rather than an agency name. */
export function isRoutePrimaryQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/^\d/.test(q)) return true;
  if (q.length <= 4 && /^[a-z0-9]+$/i.test(q)) return true;
  return false;
}

/** Lower rank = better match. */
export function routeQueryMatchRank(p: ShapeProperties, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 99;
  const qNorm = stripLeadingZeros(q);
  const shortName = (p.routeShortName ?? '').toLowerCase();
  const shortNorm = stripLeadingZeros(shortName);
  const routeId = (p.routeId ?? '').toLowerCase();
  const longName = (p.routeLongName ?? '').toLowerCase();

  if (shortName === q || shortNorm === qNorm) return 0;
  if (shortName.startsWith(q) || shortNorm.startsWith(qNorm)) return 1;
  if (routeId === q) return 2;
  if (routeId.startsWith(q)) return 3;
  if (shortName.includes(q) || shortNorm.includes(qNorm)) return 4;
  if (routeId.includes(q)) return 5;
  if (q.length >= 2 && longName.includes(q)) return 6;
  const agencySlug = ((p as { agencySlug?: string }).agencySlug ?? '').toLowerCase();
  if (agencySlug.startsWith(q)) return 7;
  return 8;
}

export function matchesRouteQuery(p: ShapeProperties, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (routeQueryMatchRank(p, q) <= 6) return true;
  const cIds = (p as { routeIds?: string[] }).routeIds;
  if (cIds?.some(r => r.toLowerCase().includes(q))) return true;
  const cNames = (p as { corridorShortNames?: string[] }).corridorShortNames;
  if (cNames?.some(n => n.toLowerCase().includes(q))) return true;
  const agencySlug = ((p as { agencySlug?: string }).agencySlug ?? '').toLowerCase();
  return agencySlug.startsWith(q);
}

function routeResultKey(p: ShapeProperties): string {
  const agencySlug = (p as { agencySlug?: string }).agencySlug ?? p.agencyName ?? '';
  return `${agencySlug}::${p.routeId}`;
}

export function searchRouteResults(
  features: GeoJSON.Feature[],
  query: string,
  bounds: ViewportBounds | null,
): RouteSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const byDisplay = new Map<string, {
    p: ShapeProperties;
    f: GeoJSON.Feature;
    inView: boolean;
    key: string;
    matchRank: number;
    distanceM: number;
  }>();

  for (const f of features) {
    if (!(f.properties as { routeId?: string }).routeId) continue;
    const p = f.properties as unknown as ShapeProperties;
    if (!matchesRouteQuery(p, q)) continue;

    const displayKey = `${(p as { agencySlug?: string }).agencySlug ?? p.agencyName ?? ''}::${p.routeShortName ?? ''}::${p.routeLongName ?? ''}`;
    const inView = bounds ? featureInViewport(f, bounds) : false;
    const distanceM = featureDistanceM(f, bounds);
    const matchRank = routeQueryMatchRank(p, q);
    const key = routeResultKey(p);
    const existing = byDisplay.get(displayKey);

    if (!existing) {
      byDisplay.set(displayKey, { p, f, inView, key, matchRank, distanceM });
    } else {
      const betterView = inView && !existing.inView;
      const betterRank = matchRank < existing.matchRank;
      const sameRankCloser = matchRank === existing.matchRank && distanceM < existing.distanceM;
      if (betterView || (inView === existing.inView && (betterRank || sameRankCloser))) {
        byDisplay.set(displayKey, { p, f, inView, key, matchRank, distanceM });
      }
    }
  }

  return [...byDisplay.values()]
    .map(({ p, inView, key, matchRank, distanceM }) => ({
      key,
      routeShortName: p.routeShortName ?? p.routeId,
      routeLongName: p.routeLongName,
      agencyName: p.agencyName,
      inView,
      distanceM,
      matchRank,
    }))
    .sort((a, b) => {
      if (a.inView !== b.inView) return a.inView ? -1 : 1;
      if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
      if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
      return (a.routeShortName ?? '').localeCompare(b.routeShortName ?? '', undefined, { numeric: true });
    });
}

export function splitByViewport<T extends { inView: boolean }>(items: T[]): SplitSearchResults<T> {
  const inView: T[] = [];
  const elsewhere: T[] = [];
  for (const item of items) {
    if (item.inView) inView.push(item);
    else elsewhere.push(item);
  }
  return { inView, elsewhere };
}

export function splitAgencyGroups(groups: AgencySearchGroup[]): SplitSearchResults<AgencySearchGroup> {
  return splitByViewport(groups);
}

export function splitRouteResults(routes: RouteSearchResult[]): SplitSearchResults<RouteSearchResult> {
  return splitByViewport(routes);
}

/** Routes before agencies on the frequency map when route-like or routes are the stronger match. */
export function routesBeforeAgencies(
  query: string,
  routes: RouteSearchResult[],
  agencies: AgencySearchGroup[],
): boolean {
  if (routes.length === 0) return false;
  if (agencies.length === 0) return true;
  if (isRoutePrimaryQuery(query)) return true;
  const routeInView = routes.some(r => r.inView);
  const agencyInView = agencies.some(a => a.inView);
  if (routeInView && !agencyInView) return true;
  if (agencyInView && !routeInView) return false;
  return routes.length <= agencies.length;
}
