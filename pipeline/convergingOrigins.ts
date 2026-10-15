/**
 * Converging origins (#879 class, TTC 29 northbound): a route direction whose trips start at two
 * different places and then run the same line to one destination under one headsign. Feature
 * dedupe keeps one pattern per (route, direction, day, headsign), so the second origin never
 * drew and the one row read a range ("every 8-16") with no shared-stretch row, while diverging
 * destinations (TTC 52's branches, each with its own headsign) already draw one row each.
 *
 * Each such origin pattern gets a route variant, "from <origin stop>", on every trip that has
 * none. The variant is already part of the dedupe slot and of the card's row label, so the
 * direction then shows "Shared stretch every 8", "from Dufferin Gate every 16" and "from
 * Princes' Gates every 16", exactly as the diverging case does.
 *
 * Two patterns are converging origins when their first stops are different stations, they end
 * at the same stop, they share at least MIN_SHARED_STOPS stops, and each has at least MIN_TRIPS
 * trips in the feed and MIN_TRIP_SHARE of the slot's trips. A start-side short turn counts (TTC 29's Dufferin Gate trips start on the
 * Princes' Gates pattern's line; TTC 94 from Wellesley starts on the Ossington pattern): the
 * end-side short turn already has its own row under its own headsign, and the start side gets
 * the same treatment. Feeds that give every trip block its own shape from one origin (CapMetro)
 * share a first stop and are untouched. Surface routes only; rail keeps one row per headsign.
 */
import type { GtfsData } from '../types/gtfs.js';
import { getModeCategory } from './defaults.js';

export const MIN_SHARED_STOPS = 5;
/** Each origin must be a real service: at least this many trips and MIN_TRIP_SHARE of the slot's trips. */
export const MIN_TRIPS = 8;
/** CapMetro gives every 4-6 trip block its own shape, some from another first stop: a one-block origin is not a starting branch. */
export const MIN_TRIP_SHARE = 0.25;
/**
 * A start-side short turn well under the full line (TTC 94 from Wellesley: 11 of the Ossington
 * pattern's 26 stops) is not drawn by shape selection (SHORT_TURN_LEN_RATIO) and keeps pooling
 * into the one row, as before; only an origin whose line is at least this share of the slot's
 * longest, by stop count, is a starting branch of its own (TTC 29 from Dufferin Gate: 44 of 49).
 */
export const MIN_STOP_SHARE = 0.75;
/**
 * At least one origin must run this far on its own before the two lines meet (first stop to
 * the first shared stop, straight line). Two patterns whose first stops are a block apart on
 * one street are one origin with a different first stop, not two starting branches; TTC 29's
 * Princes' Gates pattern runs four stops and about a kilometre of its own before it meets the
 * Dufferin Gate pattern. Both a stop count and a distance: two stops so a single far-off first
 * stop does not count, a distance so two close stops do not either.
 */
export const MIN_STUB_METERS = 500;

type Pattern = { key: string; shapeId: string; first: string; last: string; stops: Set<string>; order: string[]; trips: string[]; firstName: string };

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat); const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** How many stops a pattern runs on its own before its first stop shared with the other. */
function leadingOwnStops(a: Pattern, b: Pattern): number {
  let n = 0;
  for (const stopId of a.order) { if (b.stops.has(stopId)) break; n++; }
  return n;
}

/** How far a pattern runs on its own before its first stop shared with the other, in metres. */
function leadingOwnMeters(a: Pattern, b: Pattern, at: ReadonlyMap<string, { lat: number; lon: number }>): number {
  const merge = a.order.find(stopId => b.stops.has(stopId));
  const from = at.get(a.order[0]); const to = merge ? at.get(merge) : undefined;
  return from && to ? metersBetween(from, to) : 0;
}

export function originVariantLabel(stopName: string): string {
  return `from ${stopName.trim()}`;
}

/** Labels the trips of converging-origin patterns; returns the number of trips labelled. */
export function labelConvergingOrigins(gtfs: GtfsData): number {
  const stopName = new Map<string, string>();
  const station = new Map<string, string>();
  const at = new Map<string, { lat: number; lon: number }>();
  for (const stop of gtfs.stops ?? []) {
    stopName.set(stop.stop_id, stop.stop_name ?? stop.stop_id);
    station.set(stop.stop_id, stop.parent_station?.trim() || stop.stop_id);
    const lat = Number(stop.stop_lat), lon = Number(stop.stop_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) { at.set(stop.stop_id, { lat, lon }); at.set(stop.parent_station?.trim() || stop.stop_id, at.get(stop.parent_station?.trim() || stop.stop_id) ?? { lat, lon }); }
  }
  // Surface routes only: a rail line's stop values are scoped by headsign, so two origins under
  // one headsign would draw two identical rows (CTA Green's Harlem-bound branches); rail keeps
  // its single row.
  const surfaceRoutes = new Set((gtfs.routes ?? []).filter(r => getModeCategory(String(r.route_type ?? '')) !== 'rail').map(r => r.route_id));
  const tripById = new Map((gtfs.trips ?? []).filter(t => surfaceRoutes.has(t.route_id)).map(t => [t.trip_id, t] as const));
  const seqs = new Map<string, Array<{ seq: number; stopId: string }>>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!tripById.has(st.trip_id)) continue;
    let list = seqs.get(st.trip_id);
    if (!list) { list = []; seqs.set(st.trip_id, list); }
    list.push({ seq: Number(st.stop_sequence), stopId: st.stop_id });
  }
  // One pattern per shape within a route, direction and headsign slot.
  const slots = new Map<string, Map<string, Pattern>>();
  for (const trip of gtfs.trips ?? []) {
    if (trip.route_variant?.trim()) continue;
    const list = seqs.get(trip.trip_id);
    if (!list || list.length < 2) continue;
    list.sort((a, b) => a.seq - b.seq);
    const shapeId = trip.shape_id?.trim() || `trip:${trip.trip_id}`;
    const slotKey = `${trip.route_id}::${trip.direction_id ?? ''}::${(trip.trip_headsign ?? '').trim().toLowerCase()}`;
    let slot = slots.get(slotKey);
    if (!slot) { slot = new Map(); slots.set(slotKey, slot); }
    let pattern = slot.get(shapeId);
    if (!pattern) {
      const first = list[0].stopId;
      const order = list.map(s => station.get(s.stopId) ?? s.stopId);
      pattern = { key: slotKey, shapeId, first: order[0], last: order[order.length - 1], stops: new Set(order), order, trips: [], firstName: stopName.get(first) ?? first };
      slot.set(shapeId, pattern);
    }
    pattern.trips.push(trip.trip_id);
  }
  let labelled = 0;
  for (const slot of slots.values()) {
    const slotTrips = [...slot.values()].reduce((n, p) => n + p.trips.length, 0);
    const longest = Math.max(...[...slot.values()].map(p => p.stops.size));
    const patterns = [...slot.values()].filter(p => p.trips.length >= MIN_TRIPS && p.trips.length >= slotTrips * MIN_TRIP_SHARE && p.stops.size >= longest * MIN_STOP_SHARE);
    if (patterns.length < 2) continue;
    const converging = new Set<Pattern>();
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const a = patterns[i], b = patterns[j];
        if (a.first === b.first || a.last !== b.last) continue;
        let shared = 0;
        for (const s of a.stops) if (b.stops.has(s)) shared++;
        if (shared < MIN_SHARED_STOPS) continue;
        // One side runs a real stub of its own: at least two stops and MIN_STUB_METERS before the
        // lines meet (a single first stop a few hundred metres off the other's line is the same origin).
        const stub = (x: Pattern, y: Pattern) => leadingOwnStops(x, y) >= 2 && leadingOwnMeters(x, y, at) >= MIN_STUB_METERS;
        if (!stub(a, b) && !stub(b, a)) continue;
        converging.add(a); converging.add(b);
      }
    }
    if (converging.size < 2) continue;
    // Every pattern of the slot joins an origin's row: a thin shape (a late-night variant of the
    // Ossington pattern, TTC 94) takes the label of the converging origin it starts from or whose
    // line it starts on, so no leftover shape becomes a row of its own.
    const origins = [...converging];
    const sharedCount = (a: Pattern, b: Pattern): number => { let n = 0; for (const s of a.stops) if (b.stops.has(s)) n++; return n; };
    for (const pattern of slot.values()) {
      // Every pattern joins an origin: by first stop, by the line it starts on, else by the
      // origin it shares most stops with (a one-trip shape from a third first stop, MBTA 70),
      // so a labelled slot never leaves a thin unlabelled row behind.
      const home = origins.find(o => o.first === pattern.first)
        ?? origins.find(o => o.stops.has(pattern.first))
        ?? origins.reduce((best, o) => (sharedCount(o, pattern) > sharedCount(best, pattern) ? o : best), origins[0]);
      const label = originVariantLabel(home.firstName);
      for (const tripId of pattern.trips) { tripById.get(tripId)!.route_variant = label; labelled++; }
    }
  }
  return labelled;
}
