/**
 * nightServiceIndex.ts — derive the cross-agency Night Service directory from
 * each agency's already-processed route features, for export as
 * atlas/night-service.json.
 *
 * Night Service needs to answer "which agencies/routes qualify" across all
 * ~600 agencies at once, unlike Corridors/History which are scoped to one
 * agency the user has already picked. Fetching every agency's full GeoJSON
 * client-side to answer that would be wasteful, so this builds one small
 * aggregate file at refresh time instead — mirrors agencyIndex.ts's
 * "public directory" pattern.
 */

interface RouteFeatureProperties {
  nightService?: boolean;
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeColor?: string | null;
  directionId?: number | null;
  headsign?: string | null;
  day?: string | null;
}

interface RouteFeature {
  properties: RouteFeatureProperties;
}

export interface NightServiceRouteEntry {
  agencySlug: string;
  agencyName: string;
  region: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeColor: string | null;
  directionId: number | null;
  headsign: string | null;
  day: string | null;
}

export interface NightServiceIndexFile {
  generatedAt: string;
  criteria: string;
  agencyCount: number;
  routeCount: number;
  routes: NightServiceRouteEntry[];
}

export const NIGHT_SERVICE_CRITERIA =
  'At least one departure every 60 minutes, 2am-6am local time, with no gap at the start or end of the core overnight window.';

/**
 * Pure: pull the qualifying routes out of one agency's already-processed feature
 * collection. Called once per agency during refresh, before that agency's own
 * GeoJSON is uploaded.
 */
export function extractNightServiceRoutes(
  agencySlug: string,
  agencyName: string,
  region: string | null,
  features: RouteFeature[],
): NightServiceRouteEntry[] {
  return features
    .filter(f => f.properties.nightService === true)
    .map(f => ({
      agencySlug,
      agencyName,
      region,
      routeShortName: f.properties.routeShortName ?? null,
      routeLongName: f.properties.routeLongName ?? null,
      routeColor: f.properties.routeColor ?? null,
      directionId: f.properties.directionId ?? null,
      headsign: f.properties.headsign ?? null,
      day: f.properties.day ?? null,
    }));
}

/** Pure: aggregate every agency's extracted routes into the published index file. */
export function buildNightServiceIndex(allRoutes: NightServiceRouteEntry[]): NightServiceIndexFile {
  const routes = [...allRoutes].sort((a, b) => {
    const agencyCmp = a.agencySlug.localeCompare(b.agencySlug);
    if (agencyCmp !== 0) return agencyCmp;
    return (a.routeShortName ?? '').localeCompare(b.routeShortName ?? '', undefined, { numeric: true });
  });

  return {
    generatedAt: new Date().toISOString(),
    criteria: NIGHT_SERVICE_CRITERIA,
    agencyCount: new Set(routes.map(r => r.agencySlug)).size,
    routeCount: routes.length,
    routes,
  };
}
