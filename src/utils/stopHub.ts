/** Shared stop-hub expansion: same-name siblings + proximity hubs (120 m). */

export const STOP_HUB_PROXIMITY_M = 120;

export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const latMid = ((lat1 + lat2) * Math.PI) / 360;
  const dy = (lat2 - lat1) * 111320;
  const dx = ((lon2 - lon1) * 40075000 * Math.cos(latMid)) / 360;
  return Math.sqrt(dx * dx + dy * dy);
}

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
      const dist = getDistanceMeters(clickLat, clickLon, c.lat, c.lon);
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
