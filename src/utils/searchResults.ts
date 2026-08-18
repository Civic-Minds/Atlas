import type { GeoJSON } from 'geojson';
import type { ShapeProperties } from '../hooks/useAgencyData';
import type { ViewportBounds } from '../hooks/useIntervalStats';
import type { AgencySearchGroup } from './agencySearch';
import { buildRouteFacts } from './routeFacts';

export interface RouteSearchResult {
  key: string;
  routeShortName: string | null;
  routeLongName: string | null;
  agencyName?: string;
  inView: boolean;
  distanceM: number;
  matchRank: number;
  /** Set when this row stands in for a collapsed lettered-variant family (1/1A/1B/1C). */
  variantCount?: number;
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

/** Geometry bbox cache — search sorts by distance and must not re-walk every LineString on each keystroke. */
const featureBboxCache = new WeakMap<GeoJSON.Feature, [number, number, number, number]>();

function featureBbox(f: GeoJSON.Feature): [number, number, number, number] {
  const cached = featureBboxCache.get(f);
  if (cached) return cached;

  let bbox: [number, number, number, number];
  if (f.geometry.type === 'Point') {
    const [lon, lat] = f.geometry.coordinates;
    bbox = [lon, lat, lon, lat];
  } else {
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
    bbox = [minLon, minLat, maxLon, maxLat];
  }
  featureBboxCache.set(f, bbox);
  return bbox;
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
  // Short alphanumeric codes need a digit (e.g. 6X) — pure letters like "ttc" are agency slugs.
  if (q.length <= 6 && /\d/.test(q) && /^[a-z0-9]+$/i.test(q)) return true;
  return false;
}

/** Exact agency slug or display name — user is searching for the agency, not every route. */
export function isStrongAgencyQuery(query: string, agencies: AgencySearchGroup[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q || agencies.length === 0) return false;
  return agencies.some(a => a.slug === q || a.name.toLowerCase() === q);
}

/** Most route hits are only because the agency slug matched, not the route fields. */
function routesAreMostlyAgencySlugMatches(routes: RouteSearchResult[]): boolean {
  if (routes.length < 8) return false;
  const slugOnly = routes.filter(r => r.matchRank >= 7).length;
  return slugOnly / routes.length >= 0.75;
}

/** Query names a city that's an agency's actual primary service area (cities[0]) — not just
 *  an incidental match somewhere in its city list. This is what makes "los ang" mean LA Metro
 *  rather than any stop or route that happens to have "Los Angeles" in its name (#203). */
function matchesAgencyPrimaryCity(query: string, agencies: AgencySearchGroup[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return agencies.some(a => (a.cities?.[0] ?? '').toLowerCase().includes(q));
}

/** Agency should lead the list and implicit slug-only route matches should be hidden. */
export function prefersAgencySearchResults(
  query: string,
  routes: RouteSearchResult[],
  agencies: AgencySearchGroup[],
): boolean {
  if (agencies.length === 0) return false;
  if (isStrongAgencyQuery(query, agencies)) return true;
  if (agencies.length === 1 && routesAreMostlyAgencySlugMatches(routes)) return true;
  if (matchesAgencyPrimaryCity(query, agencies)) return true;
  return false;
}

/** Drop routes that only matched via agency slug when the query is agency-primary. */
export function filterRouteResultsForDisplay(
  query: string,
  routes: RouteSearchResult[],
  agencies: AgencySearchGroup[],
): RouteSearchResult[] {
  if (!prefersAgencySearchResults(query, routes, agencies)) return routes;
  return routes.filter(r => r.matchRank < 7);
}

/** Max route rows in the search dropdown — list stays scannable; map still highlights all matches. */
export const SEARCH_ROUTE_DISPLAY_LIMIT = 10;

export interface RouteSearchDisplay {
  routes: RouteSearchResult[];
  totalMatches: number;
  truncated: boolean;
}

const VARIANT_SUFFIX_RE = /^(\d{1,3})([A-Z])$/;

/** Collapse lettered variant families (1/1A/1B/1C) into one row — they're one route.
 *  A query that exactly names a variant (e.g. "1b") keeps that variant's row. */
export function collapseVariantFamilies(
  routes: RouteSearchResult[],
  query: string,
): RouteSearchResult[] {
  const qNorm = stripLeadingZeros(query.trim().toLowerCase());
  const groups = new Map<string, RouteSearchResult[]>();
  const order: (RouteSearchResult | string)[] = [];

  for (const r of routes) {
    const sn = (r.routeShortName ?? '').toUpperCase();
    const slug = r.key.split('::')[0];
    const m = sn.match(VARIANT_SUFFIX_RE);
    const base = m ? m[1] : (/^\d{1,3}$/.test(sn) ? sn : null);
    if (!base) { order.push(r); continue; }
    const gk = `${slug}::${base}`;
    if (!groups.has(gk)) { groups.set(gk, []); order.push(gk); }
    groups.get(gk)!.push(r);
  }

  const out: RouteSearchResult[] = [];
  for (const item of order) {
    if (typeof item !== 'string') { out.push(item); continue; }
    const members = groups.get(item)!;
    const hasLettered = members.some(r => VARIANT_SUFFIX_RE.test((r.routeShortName ?? '').toUpperCase()));
    if (members.length < 2 || !hasLettered) { out.push(...members); continue; }
    const exact = members.find(r => stripLeadingZeros((r.routeShortName ?? '').toLowerCase()) === qNorm);
    // Typing a specific lettered variant ("1b") keeps that row alone; an exact
    // base match ("1") still represents — and badges — the whole family.
    if (exact && VARIANT_SUFFIX_RE.test((exact.routeShortName ?? '').toUpperCase())) {
      out.push(exact);
      continue;
    }
    const base = item.split('::')[1];
    const rep = exact
      ?? members.find(r => (r.routeShortName ?? '').toUpperCase() === base)
      ?? [...members].sort((a, b) => a.matchRank - b.matchRank || a.distanceM - b.distanceM)[0];
    out.push({ ...rep, variantCount: members.length });
  }
  return out;
}

/** Agency-slug noise removal, family collapse, then cap (already sorted by relevance). */
export function prepareRouteResultsForDisplay(
  query: string,
  routes: RouteSearchResult[],
  agencies: AgencySearchGroup[],
  limit = SEARCH_ROUTE_DISPLAY_LIMIT,
): RouteSearchDisplay {
  const filtered = collapseVariantFamilies(filterRouteResultsForDisplay(query, routes, agencies), query);
  const totalMatches = filtered.length;
  const truncated = totalMatches > limit;
  return {
    routes: truncated ? filtered.slice(0, limit) : filtered,
    totalMatches,
    truncated,
  };
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
    const facts = buildRouteFacts(p);
    if (!matchesRouteQuery(p, q)) continue;

    const displayKey = `${facts.agencySlug}::${facts.shortName}::${facts.longName ?? ''}`;
    const inView = bounds ? featureInViewport(f, bounds) : false;
    const distanceM = featureDistanceM(f, bounds);
    const matchRank = routeQueryMatchRank(p, q);
    const key = facts.key;
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
    .map(({ p, inView, key, matchRank, distanceM }) => {
      const facts = buildRouteFacts(p);
      return {
        key,
        routeShortName: facts.shortName,
        routeLongName: facts.longName,
        agencyName: facts.agencyName,
        inView,
        distanceM,
        matchRank,
      };
    })
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
  if (prefersAgencySearchResults(query, routes, agencies)) return false;
  if (isRoutePrimaryQuery(query)) return true;
  const routeInView = routes.some(r => r.inView);
  const agencyInView = agencies.some(a => a.inView);
  if (routeInView && !agencyInView) return true;
  if (agencyInView && !routeInView) return false;
  return routes.length <= agencies.length;
}

export type SearchEnterAction =
  | { type: 'agency'; slug: string }
  | { type: 'route'; key: string }
  | { type: 'stop'; key: string };

/** Enter commits when the dropdown shows exactly one selectable row. */
export function resolveSearchEnterAction(
  displayAgencyGroups: AgencySearchGroup[],
  displayRouteResults: RouteSearchResult[],
  displayStopResults: StopSearchResult[] = [],
): SearchEnterAction | null {
  const agencyCount = displayAgencyGroups.length;
  const routeCount = displayRouteResults.length;
  const stopCount = displayStopResults.length;
  if (agencyCount + routeCount + stopCount !== 1) return null;
  if (agencyCount === 1) return { type: 'agency', slug: displayAgencyGroups[0].slug };
  if (routeCount === 1) return { type: 'route', key: displayRouteResults[0].key };
  return { type: 'stop', key: displayStopResults[0].key };
}

export interface StopSearchResult {
  key: string;
  stopId: string;
  stopName: string;
  stopCode: string | null;
  direction?: 'Northbound' | 'Southbound' | 'Eastbound' | 'Westbound' | null;
  agencyName?: string;
  agencySlug: string;
  routes: string[];
  lat: number;
  lon: number;
  inView: boolean;
  distanceM: number;
  matchRank: number;
}

export function matchesStopQuery(
  stopName: string,
  stopCode: string | null,
  query: string
): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const name = stopName.toLowerCase();
  const code = (stopCode ?? '').toLowerCase();

  if (code === q) return 0;
  if (code.startsWith(q)) return 1;
  if (name === q) return 2;
  if (name.startsWith(q)) return 3;
  if (name.includes(q)) return 4;

  return null;
}

export function searchStopResults(
  features: GeoJSON.Feature[],
  query: string,
  bounds: ViewportBounds | null,
  routeNamesMap: Map<string, string>,
): StopSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const rawResults: (StopSearchResult & { hubId?: string })[] = [];

  for (const f of features) {
    if (f.geometry.type !== 'Point') continue;
    const p = f.properties as any;
    if (!p.stopId) continue;

    const stopName = p.stopName || p.name || '';
    const stopCode = p.stopCode || null;
    const rank = matchesStopQuery(stopName, stopCode, q);
    if (rank === null) continue;

    // Convert routeIds to routeShortNames
    const rIds = (p.routeIds as string[]) || [];
    const routesSet = new Set<string>();
    for (const rid of rIds) {
      const rsn = routeNamesMap.get(`${p.agencySlug}::${rid}`);
      if (rsn) routesSet.add(rsn);
    }
    const routes = Array.from(routesSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const inView = bounds ? featureInViewport(f, bounds) : false;
    const distanceM = featureDistanceM(f, bounds);
    const [lon, lat] = f.geometry.coordinates;

    rawResults.push({
      key: `${p.agencySlug}::${p.stopId}`,
      stopId: p.stopId,
      stopName,
      stopCode,
      direction: p.direction || null,
      agencyName: p.agencyName || p.agencySlug,
      agencySlug: p.agencySlug,
      routes,
      lat,
      lon,
      inView,
      distanceM,
      matchRank: rank,
      hubId: p.hubId || undefined,
    });
  }

  // Group by hubId
  const groupedResults: StopSearchResult[] = [];
  const hubToBestIndex = new Map<string, number>();

  for (const res of rawResults) {
    if (!res.hubId) {
      groupedResults.push(res);
      continue;
    }

    const existingIndex = hubToBestIndex.get(res.hubId);
    if (existingIndex === undefined) {
      groupedResults.push(res);
      hubToBestIndex.set(res.hubId, groupedResults.length - 1);
    } else {
      const existing = groupedResults[existingIndex];

      // Combine routes
      const combinedRoutes = new Set([...existing.routes, ...res.routes]);
      existing.routes = Array.from(combinedRoutes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Promote the stop name/details if it is a better match or closer
      const shouldPromote =
        res.matchRank < existing.matchRank ||
        (res.matchRank === existing.matchRank && res.inView && !existing.inView) ||
        (res.matchRank === existing.matchRank && res.inView === existing.inView && res.distanceM < existing.distanceM);

      if (shouldPromote) {
        existing.key = res.key;
        existing.stopId = res.stopId;
        existing.stopName = res.stopName;
        existing.stopCode = res.stopCode;
        existing.direction = res.direction;
        existing.agencyName = res.agencyName || existing.agencyName;
        existing.agencySlug = res.agencySlug;
        existing.lat = res.lat;
        existing.lon = res.lon;
        existing.inView = res.inView;
        existing.distanceM = res.distanceM;
        existing.matchRank = res.matchRank;
      }
    }
  }

  return groupedResults.sort((a, b) => {
    if (a.inView !== b.inView) return a.inView ? -1 : 1;
    if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
    if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
    return a.stopName.localeCompare(b.stopName);
  });
}

export function splitStopResults(stops: StopSearchResult[]): SplitSearchResults<StopSearchResult> {
  return splitByViewport(stops);
}
