/**
 * Shared processing core: GTFS zip buffer → GeoJSON string + computed center.
 * Used by process-gtfs.ts (local zip) and refresh.ts (downloaded feeds).
 */
import { parseGtfsZip } from './parseGtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria } from './transit-phase2.js';

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

  const shapeCounts = new Map<string, Map<string, number>>();
  for (const trip of gtfs.trips ?? []) {
    if (!trip.shape_id) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;
    if (!shapeCounts.has(key)) shapeCounts.set(key, new Map());
    const m = shapeCounts.get(key)!;
    m.set(trip.shape_id, (m.get(trip.shape_id) ?? 0) + 1);
  }
  const routeDirToShape = new Map<string, string>();
  for (const [key, counts] of shapeCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) routeDirToShape.set(key, best[0]);
  }

  const shapeById = new Map((gtfs.shapes ?? []).map(s => [s.id, s.points]));

  onStatus?.('Running phase 1...');
  const raw = computeRawDepartures(gtfs, undefined, routeDirToShape);
  onStatus?.('Running phase 2...');
  const results = applyAnalysisCriteria(raw);

  const features: GeoJsonFeature[] = [];
  for (const result of results) {
    const key = `${result.route}::${result.dir}`;
    const shapeId = routeDirToShape.get(key);
    if (!shapeId) continue;
    const points = shapeById.get(shapeId);
    if (!points || points.length < 2) continue;

    const route = routeById.get(result.route);
    features.push({
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
        routeShortName: route?.route_short_name ?? null,
        routeLongName: route?.route_long_name ?? null,
        routeColor: route?.route_color ?? null,
        routeType: parseInt(result.routeType || '3'),
        day: result.day,
      },
    });
  }

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

  let center: [number, number] | null = null;
  const allCoords = features.flatMap(f => f.geometry.coordinates);
  if (allCoords.length > 0) {
    const avgLat = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length;
    const avgLon = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length;
    center = [Math.round(avgLat * 10000) / 10000, Math.round(avgLon * 10000) / 10000];
  }

  return {
    geojson: JSON.stringify({ type: 'FeatureCollection', features: [...features, ...stopFeatures] }),
    featureCount: features.length + stopFeatures.length,
    center,
  };
}
