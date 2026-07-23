import type { HeadwayByPeriod } from '../shared/config.js';

export interface CurrentHistoryRoute {
  routeShortName: string;
  routeLongName?: string;
  headway: number;
  headwayByPeriod?: HeadwayByPeriod;
  geometry?: number[][];
}

export interface HistoricalRouteIdentity {
  routeShortName: string;
  currentRouteShortNames?: string[];
}

/**
 * Resolve a historical route to its current artifact route.
 *
 * Route IDs are not stable across GTFS redesigns. Exact identity remains the
 * default; explicit aliases are used for known redesigns so a current endpoint
 * cannot disappear merely because the agency changed its short name.
 */
export function resolveCurrentHistoryRoute(
  historicalRoute: HistoricalRouteIdentity,
  currentRoutes: Record<string, CurrentHistoryRoute>,
): CurrentHistoryRoute | undefined {
  const exact = currentRoutes[historicalRoute.routeShortName];
  if (exact) return exact;

  for (const routeShortName of historicalRoute.currentRouteShortNames ?? []) {
    const aliased = currentRoutes[routeShortName];
    if (aliased) return aliased;
  }

  return undefined;
}
