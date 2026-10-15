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
 * trips in the feed and MIN_TRIP_SHARE of the slot's trips, and both run on the same service date
 * (serviceDates below). A start-side short turn counts (TTC 29's Dufferin Gate trips start on the
 * Princes' Gates pattern's line; TTC 94 from Wellesley starts on the Ossington pattern): the
 * end-side short turn already has its own row under its own headsign, and the start side gets
 * the same treatment. Feeds that give every trip block its own shape from one origin (CapMetro)
 * share a first stop and are untouched. Surface routes only; rail keeps one row per headsign.
 */
import type { DayName, DayType, GtfsData } from '../types/gtfs.js';
import { ALL_DAYS, WEEKDAYS } from '../shared/dayTypes.js';
import { getModeCategory } from './defaults.js';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar.js';

/**
 * Both origins must run on the same calendar day the pipeline draws: on at least one of the
 * seven days (read with the pipeline's own reference date and active service sets) each has
 * MIN_TRIPS trips and MIN_TRIP_SHARE of the slot's trips that day. Two origins that never share
 * a drawn day are one terminal across two service periods, not two starting branches (TriMet 79
 * and 35: Oregon City Transit Center, then its on-street relocation at Main & 12th from the
 * next period), and an event service that shares one date with the regular timetable (the CNE
 * at Dufferin Gate) never reaches a drawn day. Trips are labelled per origin and day: every
 * trip of an origin pattern active on a qualifying day is labelled, and so is every trip of
 * that pattern on any other day a labelled trip runs, so one row never splits into a labelled
 * and an unlabelled half (a service that spans the week and a Saturday-only service of the
 * same origin). A day where that leaves one origin labelled on its own is cleared again by
 * clearLoneOriginRows once the features exist.
 */
export function activeServiceIdsByCalendarDay(gtfs: GtfsData): Map<DayName, Set<string>> | null {
  if (!(gtfs.calendar?.length || gtfs.calendarDates?.length)) return null;
  const refDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates, gtfs.trips);
  return new Map(ALL_DAYS.map(day => [day, getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], day, refDate)]));
}

/** The origin label of a feature's row, or null when the feature carries no origin label. */
export function originLabelOf(variant: unknown): string | null {
  const v = typeof variant === 'string' ? variant.trim() : '';
  return v.startsWith('from ') ? v : null;
}

/**
 * A day where only one origin of a slot (route, direction, day, headsign) is drawn gets its
 * plain row back: the label names a sibling that does not run that day. Features are the
 * pipeline's route lines (one per slot and variant); only 'from <origin>' variants are touched.
 * A slot that also has a plain row (no variant at all) is left alone: clearing would leave two
 * plain rows that each read part of the trips. Labelling extends over whole day types so that
 * case does not arise; the guard keeps it from splitting a row if it ever did.
 */
export function clearLoneOriginRows(features: Array<{ properties: Record<string, unknown> }>): number {
  const slots = new Map<string, { labelled: Array<Record<string, unknown>>; plain: number }>();
  for (const f of features) {
    const p = f.properties;
    if (p.stopId != null) continue;
    const variant = typeof p.routeVariant === 'string' ? p.routeVariant.trim() : '';
    const label = originLabelOf(variant);
    if (label == null && variant !== '') continue;
    const key = `${p.routeId}::${p.directionId ?? ''}::${p.day ?? ''}::${String(p.headsign ?? '').trim().toLowerCase()}`;
    const slot = slots.get(key) ?? { labelled: [], plain: 0 };
    if (label == null) slot.plain++; else slot.labelled.push(p);
    slots.set(key, slot);
  }
  let cleared = 0;
  for (const slot of slots.values()) {
    if (slot.labelled.length === 0 || slot.plain > 0) continue;
    if (new Set(slot.labelled.map(p => originLabelOf(p.routeVariant))).size > 1) continue;
    for (const p of slot.labelled) { p.routeVariant = null; cleared++; }
  }
  return cleared;
}

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

type Pattern = { key: string; shapeId: string; first: string; last: string; stops: Set<string>; order: string[]; trips: string[]; firstName: string; tripsByDay?: Map<DayType, string[]> };

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

/**
 * Labels the trips of converging-origin patterns; returns the number of trips labelled.
 * `activeByDay` is the pipeline's active service set per calendar day (activeServiceIdsByCalendarDay);
 * a feed with no calendar at all (a test fixture) counts every trip on one day.
 */
export function labelConvergingOrigins(gtfs: GtfsData, activeByDay: Map<DayName, Set<string>> | null = activeServiceIdsByCalendarDay(gtfs)): number {
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
  // The day types the pipeline draws: Weekday is the union of Monday to Friday, as the
  // pipeline's own grouping reads it, so a Friday-only service of a pattern sits with its
  // Monday-to-Thursday service and never splits a weekday row.
  const unionOf = (names: readonly DayName[]): Set<string> => { const out = new Set<string>(); for (const n of names) for (const id of activeByDay?.get(n) ?? []) out.add(id); return out; };
  const days: Array<{ day: DayType; active: Set<string> | null }> = activeByDay
    ? [{ day: 'Weekday', active: unionOf(WEEKDAYS) }, { day: 'Saturday', active: unionOf(['Saturday']) }, { day: 'Sunday', active: unionOf(['Sunday']) }]
    : [{ day: 'Weekday', active: null }];
  const runsOn = (tripId: string, active: Set<string> | null): boolean => active == null || active.has(tripById.get(tripId)!.service_id);
  let labelled = 0;
  for (const slot of slots.values()) {
    const slotTrips = [...slot.values()].reduce((n, p) => n + p.trips.length, 0);
    const longest = Math.max(...[...slot.values()].map(p => p.stops.size));
    const patterns = [...slot.values()].filter(p => p.trips.length >= MIN_TRIPS && p.trips.length >= slotTrips * MIN_TRIP_SHARE && p.stops.size >= longest * MIN_STOP_SHARE);
    if (patterns.length < 2) continue;
    // One side runs a real stub of its own: at least two stops and MIN_STUB_METERS before the
    // lines meet (a single first stop a few hundred metres off the other's line is the same origin).
    const stub = (x: Pattern, y: Pattern) => leadingOwnStops(x, y) >= 2 && leadingOwnMeters(x, y, at) >= MIN_STUB_METERS;
    const converging = new Set<Pattern>();
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        const a = patterns[i], b = patterns[j];
        if (a.first === b.first || a.last !== b.last) continue;
        let shared = 0;
        for (const s of a.stops) if (b.stops.has(s)) shared++;
        if (shared < MIN_SHARED_STOPS) continue;
        if (!stub(a, b) && !stub(b, a)) continue;
        converging.add(a); converging.add(b);
      }
    }
    if (converging.size < 2) continue;
    // A third pattern with a real stub of its own against every origin is an origin too, share
    // or not (SFMTA 38 from 48th Ave & Point Lobos, a fifth of the trips beside the V.A. Hospital
    // branch): labelling it "from" another origin it does not start at would be wrong.
    for (const p of slot.values()) {
      if (converging.has(p) || p.trips.length < MIN_TRIPS || p.stops.size < longest * MIN_STOP_SHARE) continue;
      if ([...converging].every(o => o.last === p.last && o.first !== p.first && stub(p, o))) converging.add(p);
    }
    // Same-day gate, per drawn day type: the day types on which at least two origins each run
    // MIN_TRIPS trips and MIN_TRIP_SHARE of the slot's trips.
    const tripsByDay = (p: Pattern): Map<DayType, string[]> => {
      if (p.tripsByDay) return p.tripsByDay;
      const m = new Map<DayType, string[]>();
      for (const { day, active } of days) m.set(day, p.trips.filter(tripId => runsOn(tripId, active)));
      return (p.tripsByDay = m);
    };
    const qualifying = new Map<DayType, Set<Pattern>>();
    for (const { day, active } of days) {
      let total = 0;
      for (const p of slot.values()) total += tripsByDay(p).get(day)?.length ?? 0;
      const ok = new Set<Pattern>();
      for (const o of converging) {
        const n = tripsByDay(o).get(day)?.length ?? 0;
        if (n >= MIN_TRIPS && n >= total * MIN_TRIP_SHARE) ok.add(o);
      }
      if (ok.size >= 2) qualifying.set(day, ok);
    }
    if (qualifying.size === 0) continue;
    const origins = [...converging];
    // Every pattern of the slot joins an origin: by its first stop, else by the one origin
    // whose line it starts on (a thin late-night variant of the Ossington pattern, TTC 94),
    // else by the origin it shares the most stops with (more trips on a tie). A pattern
    // starting on the shared trunk or at a stop of its own is a short turn of the whole
    // direction, and its label overstates where those trips start; but a row of its own would
    // read its few trips as the whole service at stops every origin's bus serves (LA Metro
    // 108's Culver City short turns, 30 trips, drew an irregular row beside two origin rows
    // every 10 in the 16-agency scan), so it joins the nearest origin's row instead.
    const sharedCount = (a: Pattern, b: Pattern): number => { let n = 0; for (const stop of a.stops) if (b.stops.has(stop)) n++; return n; };
    const homeOf = (pattern: Pattern): Pattern => {
      const byFirst = origins.find(o => o.first === pattern.first);
      if (byFirst) return byFirst;
      const onLine = origins.filter(o => o.stops.has(pattern.first));
      if (onLine.length === 1) return onLine[0];
      return origins.reduce((best, o) => {
        const d = sharedCount(o, pattern) - sharedCount(best, pattern);
        return d > 0 || (d === 0 && o.trips.length > best.trips.length) ? o : best;
      }, origins[0]);
    };
    // Labelled day types: the qualifying ones, then any day type on which a trip of the slot
    // that is already labelled also runs, until nothing is added, so a day type is labelled
    // whole or not at all and no row of it splits into a labelled and a plain half (a
    // pattern whose trips run only on a non-qualifying day, or a Friday-only service).
    const labelledDays = new Set<DayType>(qualifying.keys());
    let grew = true;
    while (grew) {
      grew = false;
      const chosen = new Set<string>();
      for (const p of slot.values()) for (const day of labelledDays) for (const tripId of tripsByDay(p).get(day) ?? []) chosen.add(tripId);
      for (const { day } of days) {
        if (labelledDays.has(day)) continue;
        for (const p of slot.values()) {
          if ((tripsByDay(p).get(day) ?? []).some(tripId => chosen.has(tripId))) { labelledDays.add(day); grew = true; break; }
        }
      }
    }
    for (const pattern of slot.values()) {
      const label = originVariantLabel(homeOf(pattern).firstName);
      const chosen = new Set<string>();
      for (const day of labelledDays) for (const tripId of tripsByDay(pattern).get(day) ?? []) chosen.add(tripId);
      for (const tripId of chosen) { tripById.get(tripId)!.route_variant = label; labelled++; }
    }
  }
  return labelled;
}
