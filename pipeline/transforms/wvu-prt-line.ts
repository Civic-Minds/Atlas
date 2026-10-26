import type { GtfsData, GtfsShape, GtfsStopTime, GtfsTrip } from '../../types/gtfs.js';

/**
 * #1119: WVU's PRT feed lists every ordered pair of its five stations as its own route (20 routes), each a two-stop trip
 * every 30 minutes from a placeholder timetable; the PRT runs on demand. This folds the pairs into the one line riders
 * use, Walnut - Beechurst - Engineering - Towers - HSC, with a direction each way. Its shapes are the published
 * station-to-station shapes joined end to end; its trips are the feed's end-to-end trips (Walnut to HSC and back), calling
 * at every station. The feed's times are kept only so the line is drawn and its stops served: the line is listed in
 * onDemandRoutes, so no frequency is published from them.
 */
export const WVU_PRT_ROUTE_ID = 'PRT';

/** Station codes in line order, as the feed's shape ids name them (feed stop_name -> code). */
const LINE: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'Walnut', code: 'WAL' },
  { name: 'Beechurst', code: 'BEE' },
  { name: 'Engineering', code: 'ENG' },
  { name: 'Towers', code: 'TOW' },
  { name: 'HSC', code: 'HSC' },
];

/** Joined shapes must meet within this distance (metres) at each station. */
const MAX_JOIN_GAP_M = 60;

function metres(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  return Math.sqrt(dLat * dLat + dLon * dLon) * 6_371_000;
}

const toMinutes = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 60 + m + (s || 0) / 60; };
const toTime = (min: number) => {
  const total = Math.round(min * 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
};

/** Joins the station-to-station shapes along `codes`; null when one is missing or two do not meet. */
function joinShapes(codes: readonly string[], shapesById: Map<string, GtfsShape>): [number, number][] | null {
  const points: [number, number][] = [];
  for (let i = 0; i < codes.length - 1; i++) {
    const leg = shapesById.get(`${codes[i]}-${codes[i + 1]}`);
    if (!leg || leg.points.length < 2) return null;
    if (points.length > 0) {
      if (metres(points[points.length - 1], leg.points[0]) > MAX_JOIN_GAP_M) return null;
      points.push(...leg.points.slice(1));
    } else {
      points.push(...leg.points);
    }
  }
  return points;
}

/** The merged feed, or the input unchanged when the feed no longer has the shape this expects. */
export function mergeWvuPrtLine(gtfs: GtfsData): { gtfs: GtfsData; merged: boolean; reason?: string } {
  const stopIdByCode = new Map<string, string>();
  for (const station of LINE) {
    const stop = gtfs.stops.find(s => s.stop_name === station.name);
    if (!stop) return { gtfs, merged: false, reason: `no stop named ${station.name}` };
    stopIdByCode.set(station.code, stop.stop_id);
  }
  const shapesById = new Map(gtfs.shapes.map(s => [s.id, s]));
  const outbound = LINE.map(s => s.code);
  const inbound = [...outbound].reverse();
  const outShape = joinShapes(outbound, shapesById);
  const inShape = joinShapes(inbound, shapesById);
  if (!outShape || !inShape) return { gtfs, merged: false, reason: 'station-to-station shapes missing or not joined' };

  const timesByTrip = new Map<string, GtfsStopTime[]>();
  for (const st of gtfs.stopTimes) {
    const list = timesByTrip.get(st.trip_id) ?? [];
    list.push(st);
    timesByTrip.set(st.trip_id, list);
  }
  const first = stopIdByCode.get(outbound[0])!;
  const last = stopIdByCode.get(outbound[outbound.length - 1])!;
  const trips: GtfsTrip[] = [];
  const stopTimes: GtfsStopTime[] = [];
  for (const trip of gtfs.trips) {
    const times = (timesByTrip.get(trip.trip_id) ?? []).sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    if (times.length < 2) continue;
    const from = times[0].stop_id;
    const to = times[times.length - 1].stop_id;
    const dir = from === first && to === last ? 0 : from === last && to === first ? 1 : null;
    if (dir == null) continue;
    const codes = dir === 0 ? outbound : inbound;
    const start = toMinutes(times[0].departure_time || times[0].arrival_time);
    const end = toMinutes(times[times.length - 1].arrival_time || times[times.length - 1].departure_time);
    const tripId = `PRT-${trip.trip_id}`;
    trips.push({ route_id: WVU_PRT_ROUTE_ID, service_id: trip.service_id, trip_id: tripId, direction_id: String(dir), shape_id: `PRT-${dir}`, trip_headsign: LINE[dir === 0 ? LINE.length - 1 : 0].name });
    codes.forEach((code, i) => {
      const t = toTime(start + ((end - start) * i) / (codes.length - 1));
      stopTimes.push({ trip_id: tripId, arrival_time: t, departure_time: t, stop_id: stopIdByCode.get(code)!, stop_sequence: String(i + 1) });
    });
  }
  if (trips.length === 0) return { gtfs, merged: false, reason: 'no end-to-end trips' };

  const agencyId = gtfs.routes[0]?.agency_id;
  return {
    merged: true,
    gtfs: {
      ...gtfs,
      routes: [{ route_id: WVU_PRT_ROUTE_ID, ...(agencyId ? { agency_id: agencyId } : {}), route_short_name: 'PRT', route_type: gtfs.routes[0]?.route_type ?? '0' }],
      trips,
      stopTimes,
      shapes: [{ id: 'PRT-0', points: outShape }, { id: 'PRT-1', points: inShape }],
      frequencies: [],
    },
  };
}
