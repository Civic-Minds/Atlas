/** Shared stop-hub expansion: same-name siblings + proximity hubs (150 m). */
import { metresBetween } from '../../shared/geoDistance';

export const STOP_HUB_PROXIMITY_M = 150;

export interface StopHubCandidate {
  stopId: string;
  agencySlug: string;
  stopName?: string | null;
  lat: number;
  lon: number;
  routeIds?: string[] | null;
}

export interface StopHubResult {
  siblingIdsByAgency: Record<string, Set<string>>;
  routesByAgency: Record<string, Set<string>>;
  allRouteIds: Set<string>;
}

function cleanStopName(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => {
      const generic = new Set([
        'stop',
        'station',
        'terminal',
        'bay',
        'bays',
        'platform',
        'direction',
        'cta',
        'pace',
        'metra',
        'loop',
        'transit',
        'center',
        'ctr',
        'bus',
        'train',
        'rail',
        'subway',
        'rapid',
        'rt',
        'rd',
        'st',
        'ave',
        'blvd',
        'street',
        'avenue',
        'road',
        'park-n-ride',
        'park',
        'ride',
        'parking',
        'at',
        'and',
        '&',
        'to',
        'from',
        'for',
      ]);
      return token.length > 2 && !generic.has(token);
    });
}

function shareSignificantToken(name1: string | null | undefined, name2: string | null | undefined): boolean {
  const tokens1 = cleanStopName(name1);
  const tokens2 = cleanStopName(name2);
  if (tokens1.length === 0 || tokens2.length === 0) return false;
  return tokens1.some(t => tokens2.includes(t));
}

/** Every stop feature on the map as a hub candidate (the stop card and the map filter read the same list). */
export function stopHubCandidates(features: readonly GeoJSON.Feature[]): StopHubCandidate[] {
  return features
    .filter((f): f is GeoJSON.Feature<GeoJSON.Point> =>
      f.geometry?.type === 'Point' && !!(f.properties as { stopId?: unknown } | null)?.stopId)
    .map(f => {
      const p = f.properties as { stopId: string; agencySlug: string; stopName?: string; routeIds?: string[] };
      const [lon, lat] = f.geometry.coordinates;
      return {
        stopId: p.stopId,
        agencySlug: p.agencySlug,
        stopName: p.stopName,
        lat,
        lon,
        routeIds: p.routeIds,
      };
    });
}

/**
 * Expand a clicked stop into hub siblings: same name under the same agency,
 * or any agency stop within STOP_HUB_PROXIMITY_M. Used by map filter + stop card.
 */
export function collectStopHubSiblings(
  clickLat: number,
  clickLon: number,
  primaryAgencySlug: string,
  primaryStopName: string | null | undefined,
  candidates: StopHubCandidate[],
  proximityM: number = STOP_HUB_PROXIMITY_M,
): StopHubResult {
  const siblingIdsByAgency: Record<string, Set<string>> = {};
  const routesByAgency: Record<string, Set<string>> = {};
  const allRouteIds = new Set<string>();

  for (const c of candidates) {
    if (!c.stopId) continue;

    const isExactNameSibling =
      c.agencySlug === primaryAgencySlug && !!primaryStopName && c.stopName === primaryStopName;

    let isProximitySibling = false;
    if (!isExactNameSibling) {
      const dist = metresBetween({ lat: clickLat, lon: clickLon }, c);
      isProximitySibling =
        dist <= proximityM ||
        (dist <= 250 && shareSignificantToken(primaryStopName, c.stopName));
    }

    if (!isExactNameSibling && !isProximitySibling) continue;

    if (!siblingIdsByAgency[c.agencySlug]) siblingIdsByAgency[c.agencySlug] = new Set();
    siblingIdsByAgency[c.agencySlug].add(c.stopId);

    if (!routesByAgency[c.agencySlug]) routesByAgency[c.agencySlug] = new Set();
    if (c.routeIds) {
      for (const rId of c.routeIds) {
        routesByAgency[c.agencySlug].add(rId);
        allRouteIds.add(rId);
      }
    }
  }

  return { siblingIdsByAgency, routesByAgency, allRouteIds };
}

/**
 * The stop card's "Nearby routes" candidates (CIV-1345): for each route at a stop within `maxMeters` of the clicked
 * point, its closest such stop. The card's own stops and routes are skipped (CIV-1305's card siblings, not the whole
 * hub), so a route that only uses the stop across the road is listed, and a route that serves this stop is never
 * "nearby", even in a period it has no service here (#1117).
 */
export function nearbyRouteClosestStops(
  features: readonly GeoJSON.Feature[],
  lat: number,
  lon: number,
  ownStopIds: ReadonlySet<string> | undefined,
  ownRouteIds: ReadonlySet<string> | undefined,
  maxMeters: number,
): Map<string, { stopName: string; dist: number }> {
  const closest = new Map<string, { stopName: string; dist: number }>();
  for (const f of features) {
    if (f.geometry?.type !== 'Point') continue;
    const p = f.properties as { stopId?: string; stopName?: string; routeIds?: string[] } | null;
    if (!p?.stopId || !p.routeIds?.length || ownStopIds?.has(p.stopId)) continue;
    const [flon, flat] = (f.geometry as GeoJSON.Point).coordinates;
    const d = metresBetween({ lat, lon }, { lat: flat, lon: flon });
    if (d > maxMeters) continue;
    for (const rid of p.routeIds) {
      if (ownRouteIds?.has(rid)) continue;
      const existing = closest.get(rid);
      if (!existing || d < existing.dist) closest.set(rid, { stopName: p.stopName ?? '', dist: d });
    }
  }
  return closest;
}
