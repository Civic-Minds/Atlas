import type { GtfsData } from '../../types/gtfs.js';

const STOP_CODES: Record<string, string> = {
  HSC: 'HSC',
  Towers: 'TOW',
  Engineering: 'ENG',
  Beechurst: 'BEE',
  Walnut: 'WAL',
};

/** WVU publishes route shapes separately but omits trips.shape_id. */
export function linkWvuPrtShapes(gtfs: GtfsData): GtfsData {
  const shapeIds = new Set((gtfs.shapes ?? []).map(shape => shape.id));
  const stopCodeById = new Map(
    (gtfs.stops ?? [])
      .map(stop => [stop.stop_id, STOP_CODES[stop.stop_name]] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const stopIdsByTrip = new Map<string, Array<{ stopId: string; sequence: number }>>();
  for (const stopTime of gtfs.stopTimes ?? []) {
    const stops = stopIdsByTrip.get(stopTime.trip_id) ?? [];
    stops.push({ stopId: stopTime.stop_id, sequence: Number(stopTime.stop_sequence) });
    stopIdsByTrip.set(stopTime.trip_id, stops);
  }
  for (const stops of stopIdsByTrip.values()) {
    stops.sort((a, b) => a.sequence - b.sequence);
  }

  let linked = 0;
  const trips = (gtfs.trips ?? []).map(trip => {
    if (trip.shape_id) return trip;
    const stopIds = stopIdsByTrip.get(trip.trip_id);
    if (!stopIds || stopIds.length < 2) return trip;
    const first = stopCodeById.get(stopIds[0].stopId);
    const last = stopCodeById.get(stopIds[stopIds.length - 1].stopId);
    if (!first || !last) return trip;
    const shapeId = `${first}-${last}`;
    if (!shapeIds.has(shapeId)) return trip;
    linked++;
    return { ...trip, shape_id: shapeId };
  });

  return linked > 0 ? { ...gtfs, trips } : gtfs;
}
