import type { GtfsData, GtfsRoute } from '../types/gtfs.js';
import { resolveDisplayHeadsign } from '../shared/headsignDisplay.js';
import type { GeoJsonFeature } from './geojson-types.js';

export interface ShapeSelectionContext {
  shapeById: Map<string, [number, number][]>;
  shapeCounts: Map<string, Map<string, number>>;
  headsignShapeCounts: Map<string, Map<string, number>>;
  headsignDisplayShape: Map<string, string>;
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
  if (shapeIds.size === 0) {
    const winning = clusters.sort((a, b) => b.trips - a.trips)[0];
    if (winning) for (const sid of winning.shapeIds) shapeIds.add(sid);
  }
  return shapeIds;
}

export function buildShapeSelectionContext(
  gtfs: GtfsData,
  routeById: Map<string, GtfsRoute>,
  activeServiceIds: Set<string>,
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

      if (headsign) {
        const hKey = `${key}::${headsign}`;
        if (!headsignShapeCounts.has(hKey)) headsignShapeCounts.set(hKey, new Map());
        const hm = headsignShapeCounts.get(hKey)!;
        hm.set(trip.shape_id, (hm.get(trip.shape_id) ?? 0) + 1);
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
  const routeDirToDisplayShape = new Map<string, string>();
  const routeDirToAnalysisShapes = new Map<string, Set<string>>();

  for (const [key, counts] of shapeCounts) {
    const routeId = key.split('::')[0];
    const routeType = routeById.get(routeId)?.route_type;
    const isRail = routeType === '2' || routeType === 2;

    if (isRail) {
      const best = [...counts.keys()]
        .filter(sid => shapeById.has(sid))
        .sort((a, b) => (shapeById.get(b)?.length ?? 0) - (shapeById.get(a)?.length ?? 0))[0];
      if (best) {
        routeDirToDisplayShape.set(key, best);
        routeDirToAnalysisShapes.set(key, new Set([best]));
      }
    } else {
      const byLength = [...counts.keys()]
        .filter(sid => shapeById.has(sid))
        .sort((a, b) => (shapeById.get(b)?.length ?? 0) - (shapeById.get(a)?.length ?? 0))[0];
      if (byLength) routeDirToDisplayShape.set(key, byLength);

      const shapeEntries = [...counts.entries()]
        .map(([sid, trips]) => ({ sid, trips, len: shapeById.get(sid)?.length }))
        .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
      const analysisShapes = busAnalysisShapeIds(shapeEntries);
      if (analysisShapes.size > 0) routeDirToAnalysisShapes.set(key, analysisShapes);
    }
  }

  const shapeFilterForPhase1 = new Map<string, Set<string>>();
  for (const [key, shapeIds] of routeDirToAnalysisShapes) {
    const routeId = key.split('::')[0];
    const route = routeById.get(routeId);
    const isRail = route?.route_type === '2' || route?.route_type === 2;
    if (!isRail) shapeFilterForPhase1.set(key, shapeIds);
  }

  for (const [hKey, hShapeCounts] of headsignShapeCounts) {
    const routeId = hKey.split('::')[0];
    const route = routeById.get(routeId);
    if (route?.route_type === '2' || route?.route_type === 2) continue;
    const shapeEntries = [...hShapeCounts.entries()]
      .map(([sid, trips]) => ({ sid, trips, len: shapeById.get(sid)?.length }))
      .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
    if (shapeEntries.length === 0) continue;
    const analysisShapes = busAnalysisShapeIds(shapeEntries);
    if (analysisShapes.size > 0) shapeFilterForPhase1.set(hKey, analysisShapes);
  }

  return {
    shapeById,
    shapeCounts,
    headsignShapeCounts,
    headsignDisplayShape,
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
    if (dirId !== '0') continue;
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
