import type { ShapeProperties } from '../hooks/useIntervalStats';
import { matchesRouteQuery } from './searchResults';

/**
 * Whether a History route matches the top search bar's text, by the same rule the bar uses for
 * routes on the map (number, then name), so History has no matcher of its own (#1015).
 */
export function historyRouteMatchesQuery(route: { routeShortName: string; routeName: string }, query: string): boolean {
  return matchesRouteQuery({ routeShortName: route.routeShortName, routeLongName: route.routeName } as ShapeProperties, query);
}
