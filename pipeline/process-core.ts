/**
 * Shared processing core: GTFS zip buffer → GeoJSON string + computed center.
 * Used by process-gtfs.ts (local zip) and refresh.ts (downloaded feeds).
 */
import { parseGtfsZip } from './parseGtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria } from './transit-phase2.js';
import { calculateCorridors } from './transit-logic.js';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar.js';
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

  // Determine the active service period before building the shape filter.
  // Some agencies (e.g. DRT) encode the schedule version in shape IDs
  // (e.g. `-2026-04` vs `-2026-06`). Counting shapes across ALL trips then picks
  // the future period's shape ID, which no current-period trip matches — the shape
  // filter silently drops every trip and produces missing or wildly wrong headways.
  // Fix: count shapes only from trips in the currently active service period.
  const refDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates, gtfs.trips);
  const activeForShapes = new Set<string>([
    ...getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], 'Monday', refDate),
    ...getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], 'Saturday', refDate),
    ...getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], 'Sunday', refDate),
  ]);

  const shapeCounts = new Map<string, Map<string, number>>();
  const headsignCounts = new Map<string, Map<string, number>>();
  for (const trip of gtfs.trips ?? []) {
    if (!activeForShapes.has(trip.service_id)) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;
    if (trip.shape_id) {
      if (!shapeCounts.has(key)) shapeCounts.set(key, new Map());
      const m = shapeCounts.get(key)!;
      m.set(trip.shape_id, (m.get(trip.shape_id) ?? 0) + 1);
    }
    if (trip.trip_headsign) {
      if (!headsignCounts.has(key)) headsignCounts.set(key, new Map());
      const hm = headsignCounts.get(key)!;
      hm.set(trip.trip_headsign, (hm.get(trip.trip_headsign) ?? 0) + 1);
    }
  }

  // Most common headsign per route+direction, stripped of branch-letter prefixes
  // (e.g. DRT's "A - Windfields Farm" -> "Windfields Farm") since those internal
  // codes are meaningless without the agency's own branch legend.
  const routeDirToHeadsign = new Map<string, string>();
  for (const [key, counts] of headsignCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) {
      let h = best.replace(/^[A-Z]\s*-\s*/, '');
      
      // Strip redundant "Line X (Name) towards " or just "towards "
      h = h.replace(/^Line\s+\d+\s*\([^)]+\)\s+towards\s+/i, '');
      h = h.replace(/^towards\s+/i, '');
      
      // If the headsign is exactly the same as the route's long name, 
      // it adds no value (e.g. TTC "Line 1 (Yonge-University)")
      const route = routeById.get(key.split('::')[0]);
      if (route?.route_long_name && h.toLowerCase().trim() === route.route_long_name.toLowerCase().trim()) {
        h = ''; // Let UI fallback to Direction X
      }

      routeDirToHeadsign.set(key, h.trim());
    }
  }

  // Build shapeById early so rail shape selection can compare lengths.
  const shapeById = new Map((gtfs.shapes ?? []).map(s => [s.id, s.points]));

  // Two separate shape maps:
  // - routeDirToDisplayShape: longest shape per direction, so branching routes (e.g. HSR Route 5
  //   via Downtown Dundas) show their full geographic extent on the map.
  // - routeDirToAnalysisShape: most-common shape per direction, used to filter trips for phase 1
  //   frequency analysis so that short-turn/branch trips don't distort the headway calculation.
  const routeDirToDisplayShape = new Map<string, string>();
  // Set of shape_ids to include in the phase-1 analysis per route+dir (may contain
  // several shape_ids when they're geometrically equivalent — see below).
  const routeDirToAnalysisShapes = new Map<string, Set<string>>();
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
      if (best) { routeDirToDisplayShape.set(key, best); routeDirToAnalysisShapes.set(key, new Set([best])); }
    } else {
      // Bus display: longest shape shows full branch extent.
      const byLength = [...counts.keys()]
        .filter(sid => shapeById.has(sid))
        .sort((a, b) => (shapeById.get(b)?.length ?? 0) - (shapeById.get(a)?.length ?? 0))[0];
      if (byLength) routeDirToDisplayShape.set(key, byLength);

      // Bus analysis: cluster shapes by approximate point count (geometry-equivalence proxy).
      // TTC uses separate shape_ids per AM/PM block on the same path; Burlington uses
      // different shape_ids per day-type (weekday vs weekend) with nearly identical point
      // counts — picking only the global trip-count winner drops weekday service entirely.
      // Genuine short-turns still have a much smaller point count and stay excluded.
      const shapeEntries = [...counts.entries()]
        .map(([sid, trips]) => ({ sid, trips, len: shapeById.get(sid)?.length }))
        .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
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
      const winningGroup = clusters.sort((a, b) => b.trips - a.trips)[0];
      if (winningGroup) routeDirToAnalysisShapes.set(key, new Set(winningGroup.shapeIds));
    }
  }

  // Shape filter passed to phase 1: bus only, using the analysis shape group(s).
  // Rail short-turn trains (e.g. GO Union→Bramalea) still serve every intermediate stop,
  // so they should count toward effective corridor frequency. Excluding them (by filtering
  // to the longest shape) inflates the computed headway and pushes real rail lines like
  // Lakeshore West or Kitchener into tier=span. Bus short-turns are genuinely different
  // products (they skip part of the route) so the shape filter still applies there.
  const shapeFilterForPhase1 = new Map<string, Set<string>>();
  for (const [key, shapeIds] of routeDirToAnalysisShapes) {
    const routeId = key.split('::')[0];
    const route = routeById.get(routeId);
    const isRail = route?.route_type === '2' || route?.route_type === 2;
    if (!isRail) shapeFilterForPhase1.set(key, shapeIds);
  }

  onStatus?.('Running phase 1...');
  const raw = computeRawDepartures(gtfs, refDate, shapeFilterForPhase1);
  onStatus?.('Running phase 2...');
  const results = applyAnalysisCriteria(raw);

  // Build route features; deduplicate by (routeShortName, directionId, day) so feeds with
  // multiple schedule-period route IDs (e.g. GO Transit 04260626-LW / 06260926-LW) don't
  // emit two overlapping features per line. When duplicates exist, keep the lower headway
  // (more frequent / more trips active in the analysis window).
  const dedupedFeatures = new Map<string, GeoJsonFeature>();
  for (const result of results) {
    const key = `${result.route}::${result.dir}`;
    const shapeId = routeDirToDisplayShape.get(key);
    if (!shapeId) continue;
    const points = shapeById.get(shapeId);
    if (!points || points.length < 2) continue;

    const route = routeById.get(result.route);
    const shortName = route?.route_short_name ?? result.route;
    const dedupeKey = `${shortName}::${result.dir}::${result.day}`;
    const existing = dedupedFeatures.get(dedupeKey);
    const newHeadway = result.tier === 'span' ? null : Math.round(result.avgHeadway);
    if (
      existing &&
      newHeadway != null &&
      existing.properties.headway != null &&
      (existing.properties.headway as number) <= newHeadway
    ) continue;

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
        headway: newHeadway,
        routeShortName: shortName,
        routeLongName: route?.route_long_name ?? null,
        routeColor: route?.route_color ?? null,
        routeType: parseInt(result.routeType || '3'),
        day: result.day,
        headsign: routeDirToHeadsign.get(key) ?? null,
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
