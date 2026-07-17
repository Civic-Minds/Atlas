import type { GtfsData } from '../types/gtfs';

/** Keep only one named agency from a multi-agency feed and its dependencies. */
export function filterGtfsByAgencyName(gtfs: GtfsData, agencyName: string): GtfsData {
  const wanted = agencyName.trim().toLowerCase();
  const agencyIds = new Set(
    (gtfs.agencies ?? [])
      .filter(agency => agency.agency_name.trim().toLowerCase() === wanted)
      .map(agency => agency.agency_id)
      .filter((id): id is string => !!id),
  );
  if (agencyIds.size === 0) throw new Error(`GTFS agency not found: ${agencyName}`);
  const routes = (gtfs.routes ?? []).filter(route => !!route.agency_id && agencyIds.has(route.agency_id));
  const routeIds = new Set(routes.map(route => route.route_id));
  const trips = (gtfs.trips ?? []).filter(trip => routeIds.has(trip.route_id));
  const tripIds = new Set(trips.map(trip => trip.trip_id));
  const serviceIds = new Set(trips.map(trip => trip.service_id));
  const shapeIds = new Set(trips.map(trip => trip.shape_id).filter((id): id is string => !!id));
  const stopTimes = (gtfs.stopTimes ?? []).filter(stopTime => tripIds.has(stopTime.trip_id));
  const stopIds = new Set(stopTimes.map(stopTime => stopTime.stop_id));
  return {
    ...gtfs,
    agencies: (gtfs.agencies ?? []).filter(agency => agencyIds.has(agency.agency_id ?? '')),
    routes,
    trips,
    stopTimes,
    stops: (gtfs.stops ?? []).filter(stop => stopIds.has(stop.stop_id)),
    shapes: (gtfs.shapes ?? []).filter(shape => shapeIds.has(shape.id)),
    frequencies: (gtfs.frequencies ?? []).filter(frequency => tripIds.has(frequency.trip_id)),
    calendar: (gtfs.calendar ?? []).filter(calendar => serviceIds.has(calendar.service_id)),
    calendarDates: (gtfs.calendarDates ?? []).filter(date => serviceIds.has(date.service_id)),
    fareAttributes: (gtfs.fareAttributes ?? []).filter(fare => !fare.agency_id || agencyIds.has(fare.agency_id)),
    fareRules: (gtfs.fareRules ?? []).filter(rule => !rule.route_id || routeIds.has(rule.route_id)),
  };
}

/** Keep only the routes belonging to one agency inside a multi-agency feed. */
export function filterGtfsByAgencyId(gtfs: GtfsData, agencyId: string): GtfsData {
  const routes = (gtfs.routes ?? []).filter(r => String(r.agency_id ?? '') === agencyId);
  const routeIds = new Set(routes.map(r => r.route_id));
  const trips = (gtfs.trips ?? []).filter(t => routeIds.has(t.route_id));
  const tripIds = new Set(trips.map(t => t.trip_id));
  const shapeIds = new Set(trips.map(t => t.shape_id).filter((id): id is string => !!id));
  const serviceIds = new Set(trips.map(t => t.service_id));

  return {
    ...gtfs,
    agencies: (gtfs.agencies ?? []).filter(a => String(a.agency_id ?? '') === agencyId),
    routes,
    trips,
    stopTimes: (gtfs.stopTimes ?? []).filter(st => tripIds.has(st.trip_id)),
    shapes: (gtfs.shapes ?? []).filter(s => shapeIds.has(s.id)),
    frequencies: (gtfs.frequencies ?? []).filter(f => tripIds.has(f.trip_id)),
    calendarDates: (gtfs.calendarDates ?? []).filter(cd => serviceIds.has(cd.service_id)),
    calendar: (gtfs.calendar ?? []).filter(c => serviceIds.has(c.service_id)),
    fareAttributes: (gtfs.fareAttributes ?? []).filter(f => !f.agency_id || f.agency_id === agencyId),
    fareRules: (gtfs.fareRules ?? []).filter(r => !r.route_id || routeIds.has(r.route_id)),
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
    stopTimes: (gtfs.stopTimes ?? []).filter(st => tripIds.has(st.trip_id)),
    shapes: (gtfs.shapes ?? []).filter(s => keptShapeIds.has(s.id)),
    frequencies: (gtfs.frequencies ?? []).filter(f => tripIds.has(f.trip_id)),
    calendarDates: (gtfs.calendarDates ?? []).filter(cd => keptServiceIds.has(cd.service_id)),
    calendar: (gtfs.calendar ?? []).filter(c => keptServiceIds.has(c.service_id)),
  };
}

/** Remove trips whose headsign explicitly says they are not passenger service. */
export function filterGtfsByExcludedTripHeadsigns(gtfs: GtfsData, excludedHeadsigns: string[]): GtfsData {
  const excluded = new Set(excludedHeadsigns.map(headsign => headsign.trim().toLowerCase()));
  const excludedTripIds = new Set(
    (gtfs.trips ?? [])
      .filter(trip => excluded.has((trip.trip_headsign ?? '').trim().toLowerCase()))
      .map(trip => trip.trip_id),
  );
  if (excludedTripIds.size === 0) return gtfs;

  const trips = (gtfs.trips ?? []).filter(trip => !excludedTripIds.has(trip.trip_id));
  const keptTripIds = new Set(trips.map(trip => trip.trip_id));
  const keptShapeIds = new Set(trips.map(trip => trip.shape_id).filter((id): id is string => !!id));
  const keptServiceIds = new Set(trips.map(trip => trip.service_id));

  return {
    ...gtfs,
    trips,
    stopTimes: (gtfs.stopTimes ?? []).filter(st => keptTripIds.has(st.trip_id)),
    shapes: (gtfs.shapes ?? []).filter(shape => keptShapeIds.has(shape.id)),
    frequencies: (gtfs.frequencies ?? []).filter(freq => keptTripIds.has(freq.trip_id)),
    calendarDates: (gtfs.calendarDates ?? []).filter(date => keptServiceIds.has(date.service_id)),
    calendar: (gtfs.calendar ?? []).filter(service => keptServiceIds.has(service.service_id)),
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
    stopTimes: (gtfs.stopTimes ?? []).filter(st => tripIds.has(st.trip_id)),
    shapes: (gtfs.shapes ?? []).filter(s => shapeIds.has(s.id)),
    frequencies: (gtfs.frequencies ?? []).filter(f => tripIds.has(f.trip_id)),
  };
}
