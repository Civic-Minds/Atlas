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
      isProximitySibling =
        getDistanceMeters(clickLat, clickLon, c.lat, c.lon) <= proximityM;
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
