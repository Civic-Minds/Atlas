import type { GtfsData } from '../../types/gtfs.js';

const ROUTE_SHAPE_PREFIX: Record<string, string> = {
  '91 Line': '91',
  'Antelope Valley Line': 'AV',
  'Inland Emp.-Orange Co. Line': 'IEOC',
  'Orange County Line': 'OC',
  'Riverside Line': 'RIVER',
  'San Bernardino Line': 'SB',
  'Ventura County Line': 'VT',
};

/** Metrolink publishes route shapes but omits trips.shape_id; restore the join. */
export function linkMetrolinkShapes(gtfs: GtfsData): GtfsData {
  const shapeIds = new Set((gtfs.shapes ?? []).map(shape => shape.id));
  const routePrefixes = new Map(
    (gtfs.routes ?? [])
      .map(route => [route.route_id, ROUTE_SHAPE_PREFIX[route.route_id]] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  let linked = 0;
  const trips = (gtfs.trips ?? []).map(trip => {
    if (trip.shape_id) return trip;
    const prefix = routePrefixes.get(trip.route_id);
    if (!prefix) return trip;
    const direction = trip.direction_id === '1' ? 'out' : 'in';
    const shapeId = `${prefix}${direction}`;
    if (!shapeIds.has(shapeId)) return trip;
    linked++;
    return { ...trip, shape_id: shapeId };
  });
  return linked > 0 ? { ...gtfs, trips } : gtfs;
}
