import type { GtfsData } from '../../types/gtfs';

function cleanHeadsignForNormalizer(headsign: string, shortName: string): string {
  let h = headsign.trim();
  // Strip route number + optional letter prefix/suffix: e.g. "2A ", "2B ", "19 "
  const escaped = shortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  h = h.replace(new RegExp(`^${escaped}[A-Za-z]?\\s*(?:-\\s*)?`, 'i'), '');
  
  // Strip "via [anything]" or "via [anything] & [anything]" routing details
  h = h.replace(/\s+via\s+.+$/i, '');
  
  // Strip "to ..." or "towards ..."
  h = h.replace(/^(?:towards|to|arriving)\s+/i, '');
  
  // Trim and clean trailing/leading junk
  h = h.replace(/\s+-\s+[NSEW]b$/i, '');
  h = h.replace(/,\s+\d+.*$/i, '');
  h = h.replace(/,/g, '');
  
  return h.trim();
}

/**
 * London Transit (and potentially other agencies) GTFS feeds have redundant
 * route long names like "Route 1", "Route 2". This normalizer synthesizes
 * descriptive route names by examining unique trip headsigns for the route.
 */
export function synthesizeLondonRouteNames(gtfs: GtfsData): GtfsData {
  const routes = gtfs.routes ?? [];
  const trips = gtfs.trips ?? [];
  
  // Group trip headsigns by route_id
  const routeHeadsigns = new Map<string, Set<string>>();
  for (const trip of trips) {
    if (!trip.route_id || !trip.trip_headsign) continue;
    if (!routeHeadsigns.has(trip.route_id)) {
      routeHeadsigns.set(trip.route_id, new Set());
    }
    routeHeadsigns.get(trip.route_id)!.add(trip.trip_headsign);
  }
  
  const modifiedRoutes = routes.map(route => {
    const shortName = route.route_short_name ?? '';
    const longName = (route.route_long_name ?? '').trim();
    const isRedundant = !longName || longName.toLowerCase() === `route ${shortName.toLowerCase()}` || longName.toLowerCase() === shortName.toLowerCase();
    
    if (isRedundant && routeHeadsigns.has(route.route_id)) {
      const rawHeadsigns = routeHeadsigns.get(route.route_id)!;
      const cleanedSet = new Set<string>();
      
      for (const h of rawHeadsigns) {
        const cleaned = cleanHeadsignForNormalizer(h, shortName);
        if (cleaned && cleaned.toLowerCase() !== shortName.toLowerCase()) {
          cleanedSet.add(cleaned);
        }
      }
      
      const sortedHeadsigns = Array.from(cleanedSet).sort();
      if (sortedHeadsigns.length > 0) {
        // Take up to 2 headsigns to form a bidirectional or single-direction name
        const newLongName = sortedHeadsigns.slice(0, 2).join(' / ');
        return {
          ...route,
          route_long_name: newLongName,
        };
      }
    }
    return route;
  });
  
  return {
    ...gtfs,
    routes: modifiedRoutes,
  };
}
