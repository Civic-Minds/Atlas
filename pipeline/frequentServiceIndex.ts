export interface ResearchFrequentServiceFlags {
  daytime15: boolean;
  daytime30: boolean;
  extended15: boolean;
  extended30: boolean;
}

interface RouteFeatureProperties {
  researchFrequentService?: ResearchFrequentServiceFlags;
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeColor?: string | null;
  directionId?: number | null;
  headsign?: string | null;
  day?: string | null;
}

interface RouteFeature { properties: RouteFeatureProperties; }

export interface FrequentServiceRouteEntry {
  agencySlug: string;
  agencyName: string;
  region: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeColor: string | null;
  directionId: number | null;
  headsign: string | null;
  day: string | null;
  researchFrequentService: ResearchFrequentServiceFlags;
}

export interface FrequentServiceIndexFile {
  generatedAt: string;
  criteria: string;
  agencyCount: number;
  routeCount: number;
  routes: FrequentServiceRouteEntry[];
}

export const FREQUENT_SERVICE_CRITERIA =
  'At least one departure every 15 or 30 minutes, from 7am through 7pm or midnight, with no gap at the start or end of the selected window.';

export function extractFrequentServiceRoutes(
  agencySlug: string,
  agencyName: string,
  region: string | null,
  features: RouteFeature[],
): FrequentServiceRouteEntry[] {
  return features
    .filter(f => Object.values(f.properties.researchFrequentService ?? {}).some(Boolean))
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
      researchFrequentService: f.properties.researchFrequentService!,
    }));
}

export function buildFrequentServiceIndex(allRoutes: FrequentServiceRouteEntry[]): FrequentServiceIndexFile {
  const routes = [...allRoutes].sort((a, b) => {
    const agencyCmp = a.agencySlug.localeCompare(b.agencySlug);
    if (agencyCmp !== 0) return agencyCmp;
    return (a.routeShortName ?? '').localeCompare(b.routeShortName ?? '', undefined, { numeric: true });
  });
  return {
    generatedAt: new Date().toISOString(),
    criteria: FREQUENT_SERVICE_CRITERIA,
    agencyCount: new Set(routes.map(r => r.agencySlug)).size,
    routeCount: routes.length,
    routes,
  };
}
