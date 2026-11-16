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
 */
function withEachDaysPattern(
  selected: Set<string>,
  countsByDay: Iterable<Map<string, number>>,
  shapeLen: (sid: string) => number,
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
  const routeDirToDisplayShape = new Map<string, string>();
  const routeDirToAnalysisShapes = new Map<string, Set<string>>();

  for (const [key, counts] of shapeCounts) {
    const routeId = key.split('::')[0];
    const routeType = routeById.get(routeId)?.route_type;
    const route = routeById.get(routeId);
    const isRail = isRailRoute(route, agencySlug);

    if (isRail) {
      const best = [...counts.keys()]
        .filter(sid => shapeById.has(sid))
        .sort((a, b) => shapeLen(b) - shapeLen(a))[0];
      if (best) {
        routeDirToDisplayShape.set(key, best);
        routeDirToAnalysisShapes.set(key, new Set([best]));
      }
    } else {
      const byLength = [...counts.keys()]
        .filter(sid => shapeById.has(sid))
        .sort((a, b) => shapeLen(b) - shapeLen(a))[0];
      if (byLength) routeDirToDisplayShape.set(key, byLength);

      const shapeEntries = [...counts.entries()]
        .map(([sid, trips]) => ({ sid, trips, len: shapeLen(sid) }))
        .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
      const analysisShapes = busAnalysisShapeIds(shapeEntries);
      if (analysisShapes.size > 0) routeDirToAnalysisShapes.set(key, analysisShapes);
    }
  }

  const shapeFilterForPhase1 = new Map<string, Set<string>>();
  for (const [key, shapeIds] of routeDirToAnalysisShapes) {
    const routeId = key.split('::')[0];
    const route = routeById.get(routeId);
    const isRail = isRailRoute(route, agencySlug);
    if (!isRail) shapeFilterForPhase1.set(key, withEachDaysPattern(shapeIds, shapeCountsByDay.get(key)?.values() ?? [], shapeLen));
  }

  for (const [hKey, hShapeCounts] of headsignShapeCounts) {
    const routeId = hKey.split('::')[0];
    const route = routeById.get(routeId);
    if (isRailRoute(route, agencySlug)) continue;
    const shapeEntries = [...hShapeCounts.entries()]
      .map(([sid, trips]) => ({ sid, trips, len: shapeLen(sid) }))
      .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
    if (shapeEntries.length === 0) continue;
    const analysisShapes = busAnalysisShapeIds(shapeEntries);
    const countsByDay = [...activeServiceIdsByDay.keys()]
      .map(dayType => headsignShapeCountsByDay.get(`${hKey}::${dayType}`))
      .filter((m): m is Map<string, number> => !!m);
    if (analysisShapes.size > 0) shapeFilterForPhase1.set(hKey, withEachDaysPattern(analysisShapes, countsByDay, shapeLen));
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
