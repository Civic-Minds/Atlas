import type { GtfsData } from '../types/gtfs';

/** Keep only one named agency from a multi-agency GTFS feed and its dependencies. */
export function filterGtfsByAgencyName(gtfs: GtfsData, agencyName: string): GtfsData {
  const wanted = agencyName.trim().toLowerCase();
  const agencyIds = new Set(
    (gtfs.agencies ?? [])
      .filter(a => a.agency_name.trim().toLowerCase() === wanted)
      .map(a => a.agency_id)
      .filter((id): id is string => !!id),
  );
  if (agencyIds.size === 0) {
    throw new Error(`GTFS agency not found: ${agencyName}`);
  }

  const routes = (gtfs.routes ?? []).filter(route => route.agency_id && agencyIds.has(route.agency_id));
  const routeIds = new Set(routes.map(route => route.route_id));
  const trips = (gtfs.trips ?? []).filter(trip => routeIds.has(trip.route_id));
  const tripIds = new Set(trips.map(trip => trip.trip_id));
  const serviceIds = new Set(trips.map(trip => trip.service_id));
  const shapeIds = new Set(trips.map(trip => trip.shape_id).filter((id): id is string => !!id));
  const stopTimes = (gtfs.stop_times ?? []).filter(stopTime => tripIds.has(stopTime.trip_id));
  const stopIds = new Set(stopTimes.map(stopTime => stopTime.stop_id));

  return {
    ...gtfs,
    agencies: (gtfs.agencies ?? []).filter(agency => agencyIds.has(agency.agency_id ?? '')),
    routes,
    trips,
    stop_times: stopTimes,
    stops: (gtfs.stops ?? []).filter(stop => stopIds.has(stop.stop_id)),
    shapes: (gtfs.shapes ?? []).filter(shape => shapeIds.has(shape.id)),
    frequencies: (gtfs.frequencies ?? []).filter(frequency => tripIds.has(frequency.trip_id)),
    calendar: (gtfs.calendar ?? []).filter(calendar => serviceIds.has(calendar.service_id)),
    calendarDates: (gtfs.calendarDates ?? []).filter(date => serviceIds.has(date.service_id)),
    fareAttributes: (gtfs.fareAttributes ?? []).filter(fare => !fare.agency_id || agencyIds.has(fare.agency_id)),
    fareRules: (gtfs.fareRules ?? []).filter(rule => !rule.route_id || routeIds.has(rule.route_id)),
  };
}

/** Remove specific routes by short name (and their trips/shapes/stop_times/calendar_dates). */
export function filterGtfsByExcludedShortNames(gtfs: GtfsData, excludeShortNames: string[]): GtfsData {
  const excluded = new Set(excludeShortNames);
  const routeIds = new Set(
    (gtfs.routes ?? [])
      .filter(r => excluded.has(r.route_short_name))
      .map(r => r.route_id),
  );
  if (routeIds.size === 0) return gtfs;
  const trips = (gtfs.trips ?? []).filter(t => !routeIds.has(t.route_id));
  const tripIds = new Set(trips.map(t => t.trip_id));
  const keptShapeIds = new Set(trips.map(t => t.shape_id).filter((id): id is string => !!id));
  const keptServiceIds = new Set(trips.map(t => t.service_id));
  return {
    ...gtfs,
    routes: (gtfs.routes ?? []).filter(r => !routeIds.has(r.route_id)),
    trips,
    stop_times: (gtfs.stop_times ?? []).filter(st => tripIds.has(st.trip_id)),
    shapes: (gtfs.shapes ?? []).filter(s => keptShapeIds.has(s.id)),
    frequencies: (gtfs.frequencies ?? []).filter(f => tripIds.has(f.trip_id)),
    calendarDates: (gtfs.calendarDates ?? []).filter(cd => keptServiceIds.has(cd.service_id)),
    calendar: (gtfs.calendar ?? []).filter(c => keptServiceIds.has(c.service_id)),
  };
}

/** Keep only routes (and their trips/shapes/stop_times) matching the given GTFS route_type values. */
export function filterGtfsByRouteTypes(gtfs: GtfsData, routeTypes: number[]): GtfsData {
  const allowed = new Set(routeTypes.map(String));
  const routeIds = new Set(
    (gtfs.routes ?? [])
      .filter(r => allowed.has(String(r.route_type)))
      .map(r => r.route_id),
  );
  const trips = (gtfs.trips ?? []).filter(t => routeIds.has(t.route_id));
  const tripIds = new Set(trips.map(t => t.trip_id));
  const shapeIds = new Set(trips.map(t => t.shape_id).filter((id): id is string => !!id));

  return {
    ...gtfs,
    routes: (gtfs.routes ?? []).filter(r => routeIds.has(r.route_id)),
    trips,
    stop_times: (gtfs.stop_times ?? []).filter(st => tripIds.has(st.trip_id)),
    shapes: (gtfs.shapes ?? []).filter(s => shapeIds.has(s.id)),
    frequencies: (gtfs.frequencies ?? []).filter(f => tripIds.has(f.trip_id)),
  };
}
