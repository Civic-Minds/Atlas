import type { GtfsData } from '../../types/gtfs.js';

/**
 * CIV-1551: some feeds leave route_short_name blank and start route_long_name with the route number
 * (Manchester Transit Authority: "1 Dartmouth/VA Hospital", "2S Hanover St/East Side Plaza SAT", "41 Green DASH").
 * With the agency's `routeNumberFromLongName` set, a route with no short name whose long name starts with a number
 * (1-4 digits, then at most two capital letters) and a space takes that number as its short name and keeps the rest as
 * its long name. A route that already has a short name, or whose long name doesn't start that way, is left as published.
 */
const LEADING_NUMBER = /^(\d{1,4}[A-Z]{0,2})\s+(\S.*)$/;

export function splitLeadingRouteNumber(gtfs: GtfsData): { gtfs: GtfsData; split: number } {
  let split = 0;
  const routes = (gtfs.routes ?? []).map(route => {
    if (route.route_short_name?.trim()) return route;
    const m = LEADING_NUMBER.exec(route.route_long_name?.trim() ?? '');
    if (!m) return route;
    split++;
    return { ...route, route_short_name: m[1], route_long_name: m[2].trim() };
  });
  return { gtfs: { ...gtfs, routes }, split };
}
