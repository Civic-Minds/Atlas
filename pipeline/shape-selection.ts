import type { GtfsData, GtfsRoute } from '../types/gtfs.js';
import { resolveDisplayHeadsign } from '../shared/headsignDisplay.js';
import { isRailRoute } from './routeMode.js';
import { haversineDistance } from './utils.js';
import type { GeoJsonFeature } from './geojson-types.js';
import type { DayType } from '../shared/dayTypes.js';

/**
 * Real geographic length (meters), not raw point count — a shape's point count
 * reflects how densely it was digitized, not its actual distance. Using point
 * count as a length proxy let a sparsely-digitized-but-dominant shape (e.g.
 * STAR Rennes 77: 439 of ~560 direction-1 trips, 374 points) fall below the
 * short-turn threshold against a rarely-used, densely-digitized shape (18
 * trips, 561 points), silently filtering out nearly all of that direction's
 * real departures at phase 1 (#249).
 */
function shapeLengthMeters(points: [number, number][] | undefined): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return total;
}

export interface ShapeSelectionContext {
  shapeById: Map<string, [number, number][]>;
  shapeCounts: Map<string, Map<string, number>>;
  headsignShapeCounts: Map<string, Map<string, number>>;
  headsignDisplayShape: Map<string, string>;
  /** Representative headsign shape selected from trips active on that day type. */
  headsignDisplayShapeByDay: Map<string, string>;
  routeDirToHeadsign: Map<string, string>;
  routeDirToDisplayShape: Map<string, string>;
  routeDirToAnalysisShapes: Map<string, Set<string>>;
  shapeFilterForPhase1: Map<string, Set<string>>;
  /** CIV-1720: per headsign key, the shapes in shapeFilterForPhase1 that only a day's pick added. */
  dayPickShapes: Map<string, Set<string>>;
  lastStopByTrip: Map<string, string>;
  stopNameById: Map<string, string>;
}

const SHORT_TURN_LEN_RATIO = 0.75;

function busAnalysisShapeIds(shapeEntries: { sid: string; trips: number; len: number }[]): Set<string> {
  if (shapeEntries.length === 0) return new Set();
  const clusters: { shapeIds: string[]; trips: number; repLen: number }[] = [];
  for (const e of shapeEntries) {
    const tol = Math.max(10, Math.round(e.len * 0.01));
    const cluster = clusters.find(c => Math.abs(c.repLen - e.len) <= tol);
    if (cluster) {
      cluster.shapeIds.push(e.sid);
      cluster.trips += e.trips;
    } else {
      clusters.push({ shapeIds: [e.sid], trips: e.trips, repLen: e.len });
    }
  }
  const maxLen = Math.max(...shapeEntries.map(e => e.len));
  const shapeIds = new Set<string>();
  for (const c of clusters) {
    if (c.repLen >= maxLen * SHORT_TURN_LEN_RATIO) {
      for (const sid of c.shapeIds) shapeIds.add(sid);
    }
  }
  const totalTrips = shapeEntries.reduce((s, e) => s + e.trips, 0);
  const coveredTrips = shapeEntries.filter(e => shapeIds.has(e.sid)).reduce((s, e) => s + e.trips, 0);
  // Length normally correlates inversely with trip share (a real short-turn is both shorter
  // AND rarer), but that can invert: a rarely-used long detour/extension can be the single
  // longest shape while carrying a small minority of trips (STAR Rennes 77 direction 1: the
  // longest shape had 18 of 560 trips — 3%). Trusting length alone then excludes the shape
  // nearly all real trips actually use. If the length-qualifying set covers less than half
  // of all trips, it's not capturing the dominant pattern — fall back to trip volume instead.
  if (shapeIds.size === 0 || coveredTrips < totalTrips * 0.5) {
    shapeIds.clear();
    const winning = clusters.sort((a, b) => b.trips - a.trips)[0];
    if (winning) for (const sid of winning.shapeIds) shapeIds.add(sid);
  }
  return shapeIds;
}

/**
 * CIV-1718 (#1543): the shapes above are picked from trip counts across all days, so a pattern
 * that runs on one day type only can lose to a busier one from another day, and phase 1 then
 * drops every trip that day. Medicine Hat 30: the 8 weekday full loops (shape 257) lost to the
 * weekend half-loop (322), and the route had no Weekday row. When the chosen shapes run no trip
 * at all on a day, that day's own pick is added; a day they serve at all changes nothing, so a
 * day's short turns and minority patterns stay out as before.
 * The day's pick is added only when it carries DAY_PICK_MIN_SHARE of that day's trips, so it is
 * the day's whole service. A day split between patterns stays as before: Barrie 8A on Sundays
 * runs two hourly legs that meet at the downtown terminal, and the pick would keep one of them
 * on a 13-13 tie. In the 530-agency dry run, picks covered all or at least 80% of their day
 * (Space Coast 29 Saturday: 8 of 10, the other 2 on a 2-stop piece), or 74% and under.
 * CIV-1720 (#1547): the shapes a headsign gets only from a day's pick are listed in dayPickShapes,
 * and phase 1 keeps their trips only on a day when no other pattern of the direction makes a
 * row, so the pick fills a missing direction and never adds a second line beside one: LeeTran
 * 595 Sunday's "SB" trips in the northbound direction, Beeline 4's "Getty Square" beside
 * "Yonkers Getty Square", TTC 329's Wilson short trips (46 such lines in the dry run).
 */
const DAY_PICK_MIN_SHARE = 0.8;

/** CIV-1719: stops two legs of one trip may share (the stop where they meet, and a loop's end). */
const MAX_LEG_SHARED_STOPS = 2;

/**
 * CIV-1719 (#1546): two shapes are legs of one route when one ends at the stop where the other
 * starts and they share no more than that: Barrie 8A on Sundays runs 725 to 9005 and 9005 to
 * Georgian College, hourly each, meeting only at the downtown terminal. A short turn or branch
 * shares the main pattern's stops, so it is never a leg, and two halves that meet at both ends
 * are a trip out and back.
 */
export function joinsAsLeg(a: readonly string[], b: readonly string[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const aThenB = a[a.length - 1] === b[0];
  const bThenA = b[b.length - 1] === a[0];
  // Meeting at both ends is a trip out and back (LeeTran 595's two halves), not two legs.
  if (aThenB === bThenA) return false;
  const inA = new Set(a);
  let shared = 0;
  for (const stop of new Set(b)) if (inA.has(stop)) shared++;
  return shared <= MAX_LEG_SHARED_STOPS;
}

function withEachDaysPattern(
  selected: Set<string>,
  countsByDay: Iterable<Map<string, number>>,
  shapeLen: (sid: string) => number,
  stopsOfShape?: (sid: string) => readonly string[],
): Set<string> {
  let result = selected;
  for (const counts of countsByDay) {
    let total = 0;
    let covered = 0;
    for (const [sid, n] of counts) {
      total += n;
      if (selected.has(sid)) covered += n;
    }
    if (total === 0 || covered > 0) continue;
    const dayPick = busAnalysisShapeIds([...counts].map(([sid, trips]) => ({ sid, trips, len: shapeLen(sid) })));
    let picked = 0;
    for (const [sid, n] of counts) if (dayPick.has(sid)) picked += n;
    // CIV-1719: a pick that is one leg of a route run in legs takes the legs it joins, so the
    // day's whole route is read, not one leg of it.
    if (picked < total * DAY_PICK_MIN_SHARE && stopsOfShape) {
      for (let grew = true; grew;) {
        grew = false;
        for (const [sid, n] of counts) {
          if (dayPick.has(sid)) continue;
          if (![...dayPick].some(p => joinsAsLeg(stopsOfShape(p), stopsOfShape(sid)))) continue;
          dayPick.add(sid);
          picked += n;
          grew = true;
        }
      }
    }
    if (picked < total * DAY_PICK_MIN_SHARE) continue;
    if (result === selected) result = new Set(selected);
    for (const sid of dayPick) result.add(sid);
  }
  return result;
}

export function buildShapeSelectionContext(
  gtfs: GtfsData,
  routeById: Map<string, GtfsRoute>,
  activeServiceIds: Set<string>,
  activeServiceIdsByDay: ReadonlyMap<DayType, ReadonlySet<string>> = new Map(),
  agencySlug?: string,
): ShapeSelectionContext {
  const lastStopByTrip = new Map<string, string>();
  const maxSeqByTrip = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const currentMax = maxSeqByTrip.get(st.trip_id) ?? -1;
    if (seq > currentMax) {
      maxSeqByTrip.set(st.trip_id, seq);
      lastStopByTrip.set(st.trip_id, st.stop_id);
    }
  }

  const stopNameById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s.stop_name]));
  const shapeCounts = new Map<string, Map<string, number>>();
  const headsignCounts = new Map<string, Map<string, number>>();
  const headsignShapeCounts = new Map<string, Map<string, number>>();
  const headsignShapeCountsByDay = new Map<string, Map<string, number>>();
  /** Per route direction, per day type: trips by shape (CIV-1718). */
  const shapeCountsByDay = new Map<string, Map<DayType, Map<string, number>>>();

  const dayTypesForServiceId = new Map<string, DayType[]>();
  for (const [dayType, serviceIds] of activeServiceIdsByDay) {
    for (const serviceId of serviceIds) {
      const dayTypes = dayTypesForServiceId.get(serviceId);
      if (dayTypes) dayTypes.push(dayType);
      else dayTypesForServiceId.set(serviceId, [dayType]);
    }
  }

  for (const trip of gtfs.trips ?? []) {
    if (!activeServiceIds.has(trip.service_id)) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;

    let headsign = trip.trip_headsign?.trim() || null;
    if (!headsign) {
      const lastStopId = lastStopByTrip.get(trip.trip_id);
      if (lastStopId) headsign = stopNameById.get(lastStopId) ?? null;
    }

    if (trip.shape_id) {
      if (!shapeCounts.has(key)) shapeCounts.set(key, new Map());
      const m = shapeCounts.get(key)!;
      m.set(trip.shape_id, (m.get(trip.shape_id) ?? 0) + 1);

      for (const dayType of dayTypesForServiceId.get(trip.service_id) ?? []) {
        if (!shapeCountsByDay.has(key)) shapeCountsByDay.set(key, new Map());
        const byDay = shapeCountsByDay.get(key)!;
        if (!byDay.has(dayType)) byDay.set(dayType, new Map());
        const dm = byDay.get(dayType)!;
        dm.set(trip.shape_id, (dm.get(trip.shape_id) ?? 0) + 1);
      }

      if (headsign) {
        const hKey = `${key}::${headsign}`;
        if (!headsignShapeCounts.has(hKey)) headsignShapeCounts.set(hKey, new Map());
        const hm = headsignShapeCounts.get(hKey)!;
        hm.set(trip.shape_id, (hm.get(trip.shape_id) ?? 0) + 1);

        for (const dayType of dayTypesForServiceId.get(trip.service_id) ?? []) {
          const dayHKey = `${hKey}::${dayType}`;
          if (!headsignShapeCountsByDay.has(dayHKey)) headsignShapeCountsByDay.set(dayHKey, new Map());
          const dayHm = headsignShapeCountsByDay.get(dayHKey)!;
          dayHm.set(trip.shape_id, (dayHm.get(trip.shape_id) ?? 0) + 1);
        }
      }
    }
    if (headsign) {
      if (!headsignCounts.has(key)) headsignCounts.set(key, new Map());
      const hm = headsignCounts.get(key)!;
      hm.set(headsign, (hm.get(headsign) ?? 0) + 1);
    }
  }

  const headsignDisplayShape = new Map<string, string>();
  for (const [hKey, counts] of headsignShapeCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) headsignDisplayShape.set(hKey, best);
  }
  const headsignDisplayShapeByDay = new Map<string, string>();
  for (const [hKey, counts] of headsignShapeCountsByDay) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) headsignDisplayShapeByDay.set(hKey, best);
  }

  const routeDirToHeadsign = new Map<string, string>();
  for (const [key, counts] of headsignCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) {
      const routeId = key.split('::')[0];
      const route = routeById.get(routeId);
      const sn = route?.route_short_name?.trim() ?? null;
      const ln = route?.route_long_name?.trim() ?? null;
      const cleaned = resolveDisplayHeadsign(best, sn, ln);
      if (cleaned) routeDirToHeadsign.set(key, cleaned);
    }
  }

  const shapeById = new Map((gtfs.shapes ?? []).map(s => [s.id, s.points]));
  const shapeLenCache = new Map<string, number>();
  const shapeLen = (sid: string): number => {
    let len = shapeLenCache.get(sid);
    if (len === undefined) {
      len = shapeLengthMeters(shapeById.get(sid));
      shapeLenCache.set(sid, len);
    }
    return len;
  };
  // CIV-1719: each shape's stops in order, from one of its trips, read only when a day's pick
  // needs to find its legs.
  let shapeStops: Map<string, string[]> | null = null;
  const stopsOfShape = (sid: string): readonly string[] => {
    if (!shapeStops) {
      const tripOfShape = new Map<string, string>();
      for (const trip of gtfs.trips ?? []) if (trip.shape_id && !tripOfShape.has(trip.shape_id)) tripOfShape.set(trip.shape_id, trip.trip_id);
      const shapeOfTrip = new Map([...tripOfShape].map(([shapeId, tripId]) => [tripId, shapeId]));
      const seqStops = new Map<string, [number, string][]>();
      for (const st of gtfs.stopTimes ?? []) {
        const shapeId = shapeOfTrip.get(st.trip_id);
        if (shapeId == null) continue;
        const list = seqStops.get(shapeId) ?? [];
        list.push([parseInt(st.stop_sequence), st.stop_id]);
        seqStops.set(shapeId, list);
      }
      shapeStops = new Map([...seqStops].map(([shapeId, list]) => [shapeId, list.sort((a, b) => a[0] - b[0]).map(([, stop]) => stop)]));
    }
    return shapeStops.get(sid) ?? [];
  };
  const routeDirToDisplayShape = new Map<string, string>();
  const routeDirToAnalysisShapes = new Map<string, Set<string>>();

  // CIV-2025 restore 2 (pending Ryan): a train draws and analyses only its longest shape and skips the bus shape filter, so
  // a line's busy short-turn shape never stands in for the whole line (GO KI drawn Bramalea–Union only; MARC lost 15
  // stops). Buses keep their busy shapes for analysis and draw their longest.
  for (const [key, counts] of shapeCounts) {
    const byLength = [...counts.keys()]
      .filter(sid => shapeById.has(sid))
      .sort((a, b) => shapeLen(b) - shapeLen(a))[0];
    if (isRailRoute(routeById.get(key.split('::')[0]), agencySlug)) {
      if (byLength) {
        routeDirToDisplayShape.set(key, byLength);
        routeDirToAnalysisShapes.set(key, new Set([byLength]));
      }
      continue;
    }
    if (byLength) routeDirToDisplayShape.set(key, byLength);

    const shapeEntries = [...counts.entries()]
      .map(([sid, trips]) => ({ sid, trips, len: shapeLen(sid) }))
      .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
    const analysisShapes = busAnalysisShapeIds(shapeEntries);
    if (analysisShapes.size > 0) routeDirToAnalysisShapes.set(key, analysisShapes);
  }

  const shapeFilterForPhase1 = new Map<string, Set<string>>();
  for (const [key, shapeIds] of routeDirToAnalysisShapes) {
    if (isRailRoute(routeById.get(key.split('::')[0]), agencySlug)) continue;
    shapeFilterForPhase1.set(key, withEachDaysPattern(shapeIds, shapeCountsByDay.get(key)?.values() ?? [], shapeLen, stopsOfShape));
  }

  const dayPickShapes = new Map<string, Set<string>>();
  for (const [hKey, hShapeCounts] of headsignShapeCounts) {
    if (isRailRoute(routeById.get(hKey.split('::')[0]), agencySlug)) continue;
    const shapeEntries = [...hShapeCounts.entries()]
      .map(([sid, trips]) => ({ sid, trips, len: shapeLen(sid) }))
      .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
    if (shapeEntries.length === 0) continue;
    const analysisShapes = busAnalysisShapeIds(shapeEntries);
    if (analysisShapes.size === 0) continue;
    const countsByDay = [...activeServiceIdsByDay.keys()]
      .map(dayType => headsignShapeCountsByDay.get(`${hKey}::${dayType}`))
      .filter((m): m is Map<string, number> => !!m);
    const withDays = withEachDaysPattern(analysisShapes, countsByDay, shapeLen, stopsOfShape);
    shapeFilterForPhase1.set(hKey, withDays);
    if (withDays !== analysisShapes) dayPickShapes.set(hKey, new Set([...withDays].filter(sid => !analysisShapes.has(sid))));
  }

  return {
    shapeById,
    shapeCounts,
    headsignShapeCounts,
    headsignDisplayShape,
    headsignDisplayShapeByDay,
    routeDirToHeadsign,
    routeDirToDisplayShape,
    routeDirToAnalysisShapes,
    shapeFilterForPhase1,
    dayPickShapes,
    lastStopByTrip,
    stopNameById,
  };
}

export function annotateShortTurnVariants(
  features: GeoJsonFeature[],
  ctx: Pick<ShapeSelectionContext, 'shapeCounts' | 'headsignShapeCounts' | 'routeDirToAnalysisShapes'>,
): void {
  const dirTripTotals = new Map<string, number>();
  for (const [key, counts] of ctx.shapeCounts) {
    dirTripTotals.set(key, [...counts.values()].reduce((s, n) => s + n, 0));
  }

  const headsignByShape = new Map<string, string>();
  for (const [hKey, hShapeCounts] of ctx.headsignShapeCounts) {
    const headsign = hKey.split('::').slice(2).join('::');
    for (const [sid] of hShapeCounts) {
      if (!headsignByShape.has(sid)) headsignByShape.set(sid, headsign);
    }
  }

  for (const feature of features) {
    const dirId = String(feature.properties.directionId ?? '0');
    const routeId = feature.properties.routeId as string;
    const key = `${routeId}::${dirId}`;
    const counts = ctx.shapeCounts.get(key);
    if (!counts) continue;
    const total = dirTripTotals.get(key) ?? 0;
    if (total === 0) continue;

    const dominantShapes = ctx.routeDirToAnalysisShapes.get(key) ?? new Set<string>();
    const headsignTripCounts = new Map<string | null, number>();
    for (const [sid, tripCount] of counts) {
      if (dominantShapes.has(sid)) continue;
      const share = tripCount / total;
      if (share < 0.15) continue;
      const hs = headsignByShape.get(sid) ?? null;
      headsignTripCounts.set(hs, (headsignTripCounts.get(hs) ?? 0) + tripCount);
    }

    const variants: { headsign: string | null; tripShare: number }[] = [];
    for (const [hs, tripCount] of headsignTripCounts) {
      variants.push({
        headsign: resolveDisplayHeadsign(
          hs,
          feature.properties.routeShortName as string,
          feature.properties.routeLongName as string | null,
        ),
        tripShare: Math.round(tripCount / total * 100),
      });
    }
    if (variants.length > 0) {
      feature.properties.shortTurnVariants = variants.sort((a, b) => b.tripShare - a.tripShare);
    }
  }
}
