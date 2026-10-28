import { isRailLikeRoute } from '../shared/modes.js';
import type { GtfsRoute } from '../types/gtfs.js';

/**
 * CIV-989 / #1084: whether a feed route runs on rail, decided in one place for the pipeline. It always passes the agency,
 * so the agency's modeOverrides (config/agencies/<slug>.json) apply: GRT ION 301 is published as a streetcar and listed
 * as light rail, and was graded as a bus where a call site left the agency out.
 */
export function isRailRoute(route: Pick<GtfsRoute, 'route_type' | 'route_long_name' | 'route_short_name'> | undefined, agencySlug: string | undefined): boolean {
  return isRailLikeRoute({
    routeType: route?.route_type,
    routeLongName: route?.route_long_name,
    routeShortName: route?.route_short_name,
    agencySlug,
  });
}
