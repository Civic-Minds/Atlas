import type { GtfsData } from '../types/gtfs';

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
