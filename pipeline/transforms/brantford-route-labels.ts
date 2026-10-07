import type { GtfsData } from '../../types/gtfs.js';

/**
 * Brantford's manual feed includes a display separator at the start of the
 * route long names and uses pipes to separate a destination from Downtown as
 * a via point. Atlas supplies its own route separator, so normalize both
 * patterns before building the published artifact.
 */
export function normalizeBrantfordRouteLabels(gtfs: GtfsData): GtfsData {
  return {
    ...gtfs,
    routes: (gtfs.routes ?? []).map(route => {
      const longName = route.route_long_name?.trim();
      if (!longName || !/^[-–—]\s*/.test(longName)) return route;
      return {
        ...route,
        route_long_name: longName.replace(/^[-–—]\s*/, '').trim(),
      };
    }),
    trips: (gtfs.trips ?? []).map(trip => {
      const headsign = trip.trip_headsign?.trim();
      if (!headsign || !/\|\s*Downtown\s*$/i.test(headsign)) return trip;
      const parts = headsign.split('|').map(part => part.trim()).filter(Boolean);
      if (parts.length < 2) return trip;
      return {
        ...trip,
        trip_headsign: `${parts[0]} via ${parts.slice(1).join(' and ')}`,
      };
    }),
  };
}
