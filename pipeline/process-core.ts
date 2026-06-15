/**
 * Shared processing core: GTFS zip buffer → GeoJSON string + computed center.
 * Used by process-gtfs.ts (local zip) and refresh.ts (downloaded feeds).
 */
import { parseGtfsZip } from './parseGtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria } from './transit-phase2.js';
import { calculateCorridors } from './transit-logic.js';
import { DEFAULT_CRITERIA } from './defaults.js';

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: Record<string, unknown>;
}

export interface ProcessResult {
  geojson: string;
  featureCount: number;
  center: [number, number] | null;
}

export async function processGtfsBuffer(
  buf: Buffer,
  onStatus?: (msg: string) => void
): Promise<ProcessResult> {
  const gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, onStatus);

  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));

  // Stop coords for corridor link geometry (stop-pair chords; dense stops approximate paths)
  const stopCoords = new Map<string, [number, number]>();
  for (const stop of gtfs.stops ?? []) {
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      stopCoords.set(stop.stop_id, [lon, lat]);
    }
  }

  const shapeCounts = new Map<string, Map<string, number>>();
  for (const trip of gtfs.trips ?? []) {
    if (!trip.shape_id) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;
    if (!shapeCounts.has(key)) shapeCounts.set(key, new Map());
    const m = shapeCounts.get(key)!;
    m.set(trip.shape_id, (m.get(trip.shape_id) ?? 0) + 1);
  }

  // Build shapeById early so rail shape selection can compare lengths.
  const shapeById = new Map((gtfs.shapes ?? []).map(s => [s.id, s.points]));

  const routeDirToShape = new Map<string, string>();
  for (const [key, counts] of shapeCounts) {
    const routeId = key.split('::')[0];
    const routeType = routeById.get(routeId)?.route_type;
    const isRail = routeType === '2' || routeType === 2;

    if (isRail) {
      // For rail, pick the longest shape (most points) so short-turn patterns
      // (e.g. GO Transit Bramalea→Union) don't win over the full end-to-end route.
      const best = [...counts.keys()]
        .filter(sid => shapeById.has(sid))
        .sort((a, b) => (shapeById.get(b)?.length ?? 0) - (shapeById.get(a)?.length ?? 0))[0];
      if (best) routeDirToShape.set(key, best);
    } else {
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) routeDirToShape.set(key, best[0]);
    }
  }

  onStatus?.('Running phase 1...');
  const raw = computeRawDepartures(gtfs, undefined, routeDirToShape);
  onStatus?.('Running phase 2...');
  const results = applyAnalysisCriteria(raw);

  // Build route features; deduplicate by (routeShortName, directionId, day) so feeds with
  // multiple schedule-period route IDs (e.g. GO Transit 04260626-LW / 06260926-LW) don't
  // emit two overlapping features per line. When duplicates exist, keep the lower headway
  // (more frequent / more trips active in the analysis window).
  const dedupedFeatures = new Map<string, GeoJsonFeature>();
  for (const result of results) {
    const key = `${result.route}::${result.dir}`;
    const shapeId = routeDirToShape.get(key);
    if (!shapeId) continue;
    const points = shapeById.get(shapeId);
    if (!points || points.length < 2) continue;

    const route = routeById.get(result.route);
    const shortName = route?.route_short_name ?? result.route;
    const dedupeKey = `${shortName}::${result.dir}::${result.day}`;
    const existing = dedupedFeatures.get(dedupeKey);
    if (existing && (existing.properties.headway as number) <= Math.round(result.avgHeadway)) continue;

    dedupedFeatures.set(dedupeKey, {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        // Truncate to 5 decimal places (~1m precision) to reduce file size
        coordinates: points.map(([lat, lon]) => [
          Math.round(lon * 100000) / 100000,
          Math.round(lat * 100000) / 100000,
        ]),
      },
      properties: {
        routeId: result.route,
        directionId: parseInt(result.dir),
        tier: result.tier,
        headway: Math.round(result.avgHeadway),
        routeShortName: shortName,
        routeLongName: route?.route_long_name ?? null,
        routeColor: route?.route_color ?? null,
        routeType: parseInt(result.routeType || '3'),
        day: result.day,
      },
    });
  }
  const features = [...dedupedFeatures.values()];

  // Extract stops for clickable stations
  const stopFeatures: GeoJsonFeature[] = [];
  const stopsByRoute = new Map<string, Set<string>>();
  
  // Find which stops are served by which routes
  for (const st of gtfs.stopTimes ?? []) {
    const trip = (gtfs.trips ?? []).find(t => t.trip_id === st.trip_id);
    if (!trip) continue;
    if (!stopsByRoute.has(trip.route_id)) stopsByRoute.set(trip.route_id, new Set());
    stopsByRoute.get(trip.route_id)!.add(st.stop_id);
  }

  const servedStopIds = new Set((gtfs.stopTimes ?? []).map(st => st.stop_id));
  for (const stop of gtfs.stops ?? []) {
    if (!servedStopIds.has(stop.stop_id)) continue;
    
    // Find all routes serving this stop
    const routeIds = Array.from(stopsByRoute.entries())
      .filter(([, stopIds]) => stopIds.has(stop.stop_id))
      .map(([routeId]) => routeId);

    stopFeatures.push({
      type: 'Feature',
      geometry: {
        type: 'Point' as any,
        coordinates: [
          Math.round(parseFloat(stop.stop_lon) * 100000) / 100000,
          Math.round(parseFloat(stop.stop_lat) * 100000) / 100000,
        ],
      },
      properties: {
        stopId: stop.stop_id,
        stopName: stop.stop_name,
        routeIds,
      },
    } as any);
  }

  // Combined frequency corridors (AI-17): overlapping routes (2+ sharing consecutive stop links)
  // get aggregate headway from the *union* of their departures. Emitted as small LineStrings
  // between stop pairs so they chain into corridor paths. Drawn on top of per-route lines to
  // visually surface the combined frequency on shared segments.
  //
  // Corridors are skipped for all-rail feeds (route_type=2): rail lines run on dedicated
  // single-operator corridors where combined frequency is not meaningful, and the stop-pair
  // chord geometry creates misleading straight-line visuals over the actual shaped route.
  const allRailFeed = (gtfs.routes ?? []).length > 0 &&
    (gtfs.routes ?? []).every(r => r.route_type === '2' || r.route_type === 2);

  onStatus?.('Calculating combined corridors...');
  const corridorFeatures: GeoJsonFeature[] = [];
  if (!allRailFeed) {
  const dayTypes: Array<'Weekday' | 'Saturday' | 'Sunday'> = ['Weekday', 'Saturday', 'Sunday'];
  for (const d of dayTypes) {
    const dayCfg = DEFAULT_CRITERIA.dayTypes[d];
    if (!dayCfg) continue;
    const corrs = calculateCorridors(gtfs, d, dayCfg.timeWindow.start, dayCfg.timeWindow.end);
    for (const c of corrs) {
      const a = stopCoords.get(c.stopA);
      const b = stopCoords.get(c.stopB);
      if (!a || !b) continue;
      const h = Math.round(c.avgHeadway);
      const shortNames = c.routeIds
        .map((rid: string) => routeById.get(rid)?.route_short_name ?? rid)
        .filter(Boolean);
      corridorFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [a, b],
        },
        properties: {
          isCorridor: true,
          corridorId: c.linkId,
          headway: h,
          tier: String(h),
          routeIds: c.routeIds,
          corridorShortNames: shortNames,
          day: d,
          reliabilityScore: c.reliabilityScore,
        },
      });
    }
  }
  } // end !allRailFeed

  let center: [number, number] | null = null;
  const allCoords = features.flatMap(f => f.geometry.coordinates);
  if (allCoords.length > 0) {
    const avgLat = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
    const avgLon = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
    center = [Math.round(avgLat * 10000) / 10000, Math.round(avgLon * 10000) / 10000];
  }

  const allFeatures = [...features, ...stopFeatures, ...corridorFeatures];
  return {
    geojson: JSON.stringify({ type: 'FeatureCollection', features: allFeatures }),
    featureCount: allFeatures.length,
    center,
  };
}
