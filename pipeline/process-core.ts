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
import { filterGtfsByRouteTypes, filterGtfsByExcludedShortNames } from './filterGtfs.js';
import { mergeNrtDayNightRoutes } from './transforms/nrt-day-night.js';
import { cleanHeadsign } from '../shared/cleanHeadsign.js';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { TIME_PERIODS, HEADWAY_TIERS } from '../shared/config.js';

export type GtfsPreprocess = 'nrt-day-night';

// Douglas-Peucker line simplification. Tolerance in degrees (~0.0001 ≈ 11m).
function simplifyLine(coords: number[][], tolerance: number): number[][] {
  if (coords.length <= 2) return coords;
  const [x1, y1] = coords[0];
  const [x2, y2] = coords[coords.length - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const [px, py] = coords[i];
    const dist = lenSq === 0
      ? Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
      : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / Math.sqrt(lenSq);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  if (maxDist > tolerance) {
    const left = simplifyLine(coords.slice(0, maxIdx + 1), tolerance);
    const right = simplifyLine(coords.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [coords[0], coords[coords.length - 1]];
}

const PERIODS = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }])
) as Record<string, { start: number; end: number }>;

type PeriodKey = 'amPeak' | 'midday' | 'pmPeak' | 'evening' | 'lateNight';
export type HeadwayByPeriod = Partial<Record<PeriodKey, number | null>>;

// Hours covered by the hourly sparkline: 5 AM through 2 AM next day (GTFS hour 26)
const SPARKLINE_HOURS = Array.from({ length: 22 }, (_, i) => i + 5); // [5, 6, ..., 26]
export type HeadwayByHour = Partial<Record<number, number | null>>;

// AI-66: detect bus sub-type from route attributes and agency slug
function detectBusSubType(
  routeType: string | number | undefined,
  shortName: string,
  longName: string | null,
  agencySlug?: string,
): 'brt' | 'express' | 'coach' | 'local' | undefined {
  const rt = parseInt(String(routeType ?? '3'));
  if (rt !== 3) return undefined; // only tag route_type=3 buses
  const combined = `${shortName} ${longName ?? ''}`.toLowerCase();
  if (/\b(brt|bus rapid transit|viva|züm|zum|pulse|b-line|bline)\b/.test(combined)) return 'brt';
  if (/\b(express|xpress)\b/.test(combined)) return 'express';
  if (agencySlug === 'go') return 'coach';
  return 'local';
}

function medianHeadwayInWindow(departureTimes: number[], start: number, end: number, minDeps = 2): number | null {
  // Deduplicate and sort before computing gaps. Agencies that split the same schedule across
  // multiple service_ids (e.g. OC Transpo Mon-Thu + Friday Confederation Line both having
  // monday=1) would otherwise produce exact-duplicate minutes that collapse gaps to 0.
  const times = [...new Set(departureTimes)].filter(t => t >= start && t <= end).sort((a, b) => a - b);
  if (times.length < minDeps) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  return Math.round(gaps[Math.floor(gaps.length / 2)]);
}

function computePeriodHeadways(departureTimes: number[]): HeadwayByPeriod {
  const result: HeadwayByPeriod = {};
  for (const [key, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
    // Require ≥3 departures per period: 2 departures gives only 1 gap, which is a single
    // measurement, not a repeating headway. Niagara Falls GO with 2 AM Peak trains would
    // otherwise show "every 90 min AM Peak" from a single gap.
    result[key] = medianHeadwayInWindow(departureTimes, start, end, 3);
  }
  return result;
}

/**
 * Returns the parameter t ∈ [0, cumLen] (cumulative metres along the polyline)
 * of the nearest point to `pt` on the segment from `a` to `b`.
 * Uses flat-earth approximation — accurate enough for stops within a city.
 */
function nearestParamOnSegment(
  pt: [number, number],   // [lat, lon]
  a: [number, number],
  b: [number, number],
  segLen: number,         // precomputed length of a→b in degrees²-space
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (segLen === 0) return 0;
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / segLen));
  return t;
}

/**
 * Projects each stop onto the polyline (shape coordinates [lat, lon][]).
 * Returns stops sorted by their projected position along the shape (0 → end),
 * with normalized t values (0.0–1.0) for frontend geometry clipping and
 * dev2 (squared degrees deviation from the nearest shape point) for proximity filtering.
 * Stops that can't be projected (not in stopsById) are omitted.
 */
function projectStopsOntoShape(
  stopIds: string[],
  stopsById: Map<string, { lat: number; lon: number }>,
  shapePts: [number, number][],  // [lat, lon][]
): { stopId: string; t: number; dev2: number }[] {
  if (shapePts.length < 2) return [];

  const segLens: number[] = [];
  const cumLen: number[] = [0];
  for (let i = 0; i < shapePts.length - 1; i++) {
    const dx = shapePts[i + 1][0] - shapePts[i][0];
    const dy = shapePts[i + 1][1] - shapePts[i][1];
    const len2 = dx * dx + dy * dy;
    segLens.push(len2);
    cumLen.push(cumLen[i] + Math.sqrt(len2));
  }
  const totalLen = cumLen[cumLen.length - 1];
  if (totalLen === 0) return [];

  const projected: { stopId: string; t: number; dev2: number }[] = [];
  for (const stopId of stopIds) {
    const stop = stopsById.get(stopId);
    if (!stop) continue;
    const pt: [number, number] = [stop.lat, stop.lon];

    let bestT = 0;
    let bestDist2 = Infinity;
    for (let i = 0; i < shapePts.length - 1; i++) {
      const segT = nearestParamOnSegment(pt, shapePts[i], shapePts[i + 1], segLens[i]);
      const nearLat = shapePts[i][0] + segT * (shapePts[i + 1][0] - shapePts[i][0]);
      const nearLon = shapePts[i][1] + segT * (shapePts[i + 1][1] - shapePts[i][1]);
      const dx = pt[0] - nearLat;
      const dy = pt[1] - nearLon;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestT = (cumLen[i] + segT * Math.sqrt(segLens[i])) / totalLen;
      }
    }
    projected.push({ stopId, t: bestT, dev2: bestDist2 });
  }

  return projected.sort((a, b) => a.t - b.t);
}

export interface ProcessOptions {
  routeTypes?: number[];
  preprocess?: GtfsPreprocess;
  excludeRouteShortNames?: string[];
  slug?: string;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: number[][] };
  properties: Record<string, unknown>;
}

export interface StopEntry {
  name: string;
  lat: number;
  lon: number;
}

export interface ProcessResult {
  geojson: string;
  corridorsGeojson: string; // isCorridor features only, served separately
  stopsJson: string; // JSON: Record<stopId, StopEntry> — for Corridors stop search
  featureCount: number;
  center: [number, number] | null;
  feedExpiry: string | null;   // feed_end_date from feed_info.txt, or null if absent
  feedVersion: string | null;  // feed_version from feed_info.txt, or null if absent
  livePollingSidecar?: Record<string, any>;
}

export async function processGtfsBuffer(
  buf: Buffer,
  onStatus?: (msg: string) => void,
  options?: ProcessOptions,
): Promise<ProcessResult> {
  let gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, onStatus);
  if (options?.routeTypes?.length) {
    gtfs = filterGtfsByRouteTypes(gtfs, options.routeTypes);
  }
  if (options?.excludeRouteShortNames?.length) {
    gtfs = filterGtfsByExcludedShortNames(gtfs, options.excludeRouteShortNames);
  }
  if (options?.preprocess === 'nrt-day-night') {
    const { gtfs: merged, result } = mergeNrtDayNightRoutes(gtfs);
    gtfs = merged;
    onStatus?.(
      `NRT day/night merge: ${result.mergedPairs.length} pairs, ${result.tripsReassigned} trips reassigned` +
        (result.orphanEveRoutes.length ? `, ${result.orphanEveRoutes.length} unmatched 4xx` : '') +
        (result.shapeWarnings.length ? `, ${result.shapeWarnings.length} shape warnings` : ''),
    );
    for (const warning of result.shapeWarnings) {
      onStatus?.(`NRT shape audit: ${warning}`);
    }
  }

  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));

  // Stop coords for corridor link geometry (stop-pair chords; dense stops approximate paths)
  const stopCoords = new Map<string, [number, number]>();
  const stopsById = new Map<string, { lat: number; lon: number }>();
  for (const stop of gtfs.stops ?? []) {
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      stopCoords.set(stop.stop_id, [lon, lat]);
      stopsById.set(stop.stop_id, { lat, lon });
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
  // shape counts per (routeId, dir, headsign) so each direction/terminus gets its own shape
  const headsignShapeCounts = new Map<string, Map<string, number>>();
  for (const trip of gtfs.trips ?? []) {
    if (!activeForShapes.has(trip.service_id)) continue;
    const key = `${trip.route_id}::${trip.direction_id ?? '0'}`;
    if (trip.shape_id) {
      if (!shapeCounts.has(key)) shapeCounts.set(key, new Map());
      const m = shapeCounts.get(key)!;
      m.set(trip.shape_id, (m.get(trip.shape_id) ?? 0) + 1);
      
      if (trip.trip_headsign) {
        const hKey = `${key}::${trip.trip_headsign}`;
        if (!headsignShapeCounts.has(hKey)) headsignShapeCounts.set(hKey, new Map());
        const hm = headsignShapeCounts.get(hKey)!;
        hm.set(trip.shape_id, (hm.get(trip.shape_id) ?? 0) + 1);
      }
    }
    if (trip.trip_headsign) {
      if (!headsignCounts.has(key)) headsignCounts.set(key, new Map());
      const hm = headsignCounts.get(key)!;
      hm.set(trip.trip_headsign, (hm.get(trip.trip_headsign) ?? 0) + 1);
    }
  }

  // Most common shape per (routeId, dir, headsign) for terminus splitting
  const headsignDisplayShape = new Map<string, string>(); // "routeId::dir::headsign" → shapeId
  for (const [hKey, counts] of headsignShapeCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) headsignDisplayShape.set(hKey, best);
  }

  // Most common headsign per route+direction, stripped of branch-letter prefixes
  // (e.g. DRT's "A - Windfields Farm" -> "Windfields Farm") since those internal
  // codes are meaningless without the agency's own branch legend.
  const routeDirToHeadsign = new Map<string, string>();
  for (const [key, counts] of headsignCounts) {
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) {
      const routeId = key.split('::')[0];
      const route = routeById.get(routeId);
      const sn = route?.route_short_name?.trim() ?? null;
      const ln = route?.route_long_name?.trim() ?? null;
      routeDirToHeadsign.set(key, cleanHeadsign(best, sn, ln));
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

  // Per-headsign shape filters for routes with genuine headsign-based branches
  // (e.g. DRT 905 "A - Windfields Farm" vs "C - Uxbridge / Port Perry").
  // The base cluster picks the majority headsign's shape, filtering out minority
  // branches entirely. By adding headsign-specific entries, each branch uses only
  // its own shape for analysis — the existing short-turn filter behaviour is
  // preserved for trips that share the dominant headsign.
  for (const [hKey, hShapeCounts] of headsignShapeCounts) {
    const parts = hKey.split('::');
    const routeId = parts[0];
    const dirId = parts[1];
    const route = routeById.get(routeId);
    if (route?.route_type === '2' || route?.route_type === 2) continue;
    const shapeEntries = [...hShapeCounts.entries()]
      .map(([sid, trips]) => ({ sid, trips, len: shapeById.get(sid)?.length }))
      .filter((e): e is { sid: string; trips: number; len: number } => e.len != null);
    if (shapeEntries.length === 0) continue;
    const hClusters: { shapeIds: string[]; trips: number; repLen: number }[] = [];
    for (const e of shapeEntries) {
      const tol = Math.max(10, Math.round(e.len * 0.01));
      const cluster = hClusters.find(c => Math.abs(c.repLen - e.len) <= tol);
      if (cluster) { cluster.shapeIds.push(e.sid); cluster.trips += e.trips; }
      else hClusters.push({ shapeIds: [e.sid], trips: e.trips, repLen: e.len });
    }
    const winning = hClusters.sort((a, b) => b.trips - a.trips)[0];
    if (winning) shapeFilterForPhase1.set(hKey, new Set(winning.shapeIds));
  }

  onStatus?.('Running phase 1...');
  const raw = computeRawDepartures(gtfs, refDate, shapeFilterForPhase1);
  onStatus?.('Running phase 2...');
  const results = applyAnalysisCriteria(raw);

  // Build lookup from (route::dir::DayType) → departure times for period headway computation.
  // When multiple raw entries cover the same route/dir/dayType (Mon–Fri), keep the one with
  // the most trips as the representative day.
  const rawByDayType = new Map<string, number[]>();
  for (const r of raw) {
    const dayType = (['Monday','Tuesday','Wednesday','Thursday','Friday'] as const).includes(r.day as never)
      ? 'Weekday'
      : r.day === 'Saturday' ? 'Saturday' : 'Sunday';
    const k = `${r.route}::${r.dir}::${dayType}`;
    const existing = rawByDayType.get(k);
    if (!existing || r.departureTimes.length > existing.length) rawByDayType.set(k, r.departureTimes);
  }

  // Per-stop headway computation (AI-96): map serviceId → dayType, then tripId → group,
  // so we can collect per-stop departure arrays from stop_times without a second GTFS scan.
  // This runs before the feature-building loop; stop_times are scanned once below alongside
  // the existing routesByStop collection.
  const serviceIdToDayType = new Map<string, 'Weekday' | 'Saturday' | 'Sunday'>();
  for (const dayType of ['Weekday', 'Saturday', 'Sunday'] as const) {
    const calDay = dayType === 'Weekday' ? 'Monday' : dayType;
    for (const id of getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], calDay, refDate)) {
      if (!serviceIdToDayType.has(id)) serviceIdToDayType.set(id, dayType);
    }
  }
  const tripGroupByTripId = new Map<string, { routeId: string; shortName: string; dirId: string; dayType: string }>();
  for (const trip of gtfs.trips ?? []) {
    const dayType = serviceIdToDayType.get(trip.service_id);
    if (!dayType) continue;
    // Use shortName as the group key so agencies with multiple route_ids per line (e.g. GO Transit
    // date-prefixed IDs like 04260626-LW / 06260926-LW) merge into one combined stop frequency group.
    const shortName = routeById.get(trip.route_id)?.route_short_name ?? trip.route_id;
    tripGroupByTripId.set(trip.trip_id, {
      routeId: trip.route_id,
      shortName,
      dirId: String(trip.direction_id ?? '0'),
      dayType,
    });
  }
  // stopDepsByGroup["routeId::dirId::dayType"] → stopId → sorted departure minutes
  const stopDepsByGroup = new Map<string, Map<string, number[]>>();
  // Track first visit per (trip_id, stop_id) to avoid double-counting loop routes
  // where the terminus appears at both the start and end of the same trip.
  const stopFirstVisit = new Map<string, Set<string>>();

  // Build route features; deduplicate by (routeShortName, directionId, day) so feeds with
  // multiple schedule-period route IDs (e.g. GO Transit 04260626-LW / 06260926-LW) don't
  // emit two overlapping features per line. When duplicates exist, keep the lower headway
  // (more frequent / more trips active in the analysis window).
  const dedupedFeatures = new Map<string, GeoJsonFeature>();
  for (const result of results) {
    const key = `${result.route}::${result.dir}`;
    // Use the headsign-specific shape so each pattern (e.g. Bramalea GO vs Kitchener GO, or 
    // bidirectional bus routes with a shared direction_id) maps to its own correctly-lengthed geometry.
    const hKey = (result.headsign) ? `${key}::${result.headsign}` : null;
    const shapeId = (hKey && headsignDisplayShape.has(hKey))
      ? headsignDisplayShape.get(hKey)
      : routeDirToDisplayShape.get(key);
    if (!shapeId) continue;
    const points = shapeById.get(shapeId);
    if (!points || points.length < 2) continue;

    const route = routeById.get(result.route);
    const shortName = route?.route_short_name ?? result.route;
    // Deduplicate by (shortName, dir, day, headsign) so separate directions and terminuses
    // aren't collapsed together.
    const dedupeKey = result.headsign
      ? `${shortName}::${result.dir}::${result.day}::${result.headsign}`
      : `${shortName}::${result.dir}::${result.day}`;
    const existing = dedupedFeatures.get(dedupeKey);
    const isRailRoute = route?.route_type === '2' || route?.route_type === 2;
    const newHeadway = result.tier === 'span' ? null : Math.round(result.medianHeadway);
    // Skip if: new result is span (null headway) — span never beats a real tier.
    // Or if existing already has an equal or better real headway.
    if (
      existing &&
      (newHeadway == null ||
       (existing.properties.headway != null &&
        (existing.properties.headway as number) <= newHeadway))
    ) continue;

    dedupedFeatures.set(dedupeKey, {
      type: 'Feature',
      geometry: {
        type: 'LineString',
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
        headwayByPeriod: (() => {
          const times = rawByDayType.get(`${result.route}::${result.dir}::${result.day}`);
          return times ? computePeriodHeadways(times) : undefined;
        })(),
        routeShortName: shortName,
        routeLongName: route?.route_long_name ?? null,
        routeColor: route?.route_color ?? null,
        routeType: parseInt(result.routeType || '3'),
        busSubType: detectBusSubType(result.routeType, shortName, route?.route_long_name ?? null, options?.slug),
        day: result.day,
        headsign: result.headsign
          ? cleanHeadsign(result.headsign, shortName, route?.route_long_name?.trim() ?? null) || null
          : routeDirToHeadsign.get(key) ?? null,
      },
    });
  }
  const features = [...dedupedFeatures.values()];

  // Attach per-stop headways — populated once stop_times are scanned below.
  // We store a reference to the pending map so the loop below can fill it.
  const featureStopHeadwaySlots = new Map<GeoJsonFeature, { shortName: string; dirId: string; day: string }>();
  for (const feature of features) {
    const p = feature.properties;
    if (p.routeShortName && p.directionId != null && p.day) {
      featureStopHeadwaySlots.set(feature, {
        shortName: p.routeShortName as string,
        dirId: String(p.directionId),
        day: p.day as string,
      });
    }
  }

  // Extract stops for clickable stations
  const stopFeatures: GeoJsonFeature[] = [];
  const routesByStop = new Map<string, Set<string>>();
  const tripById = new Map((gtfs.trips ?? []).map(t => [t.trip_id, t]));

  // Build child→parent map for GTFS parent_station hierarchy (AI-117).
  // Some agencies (e.g. OC Transpo) reference only child platform IDs in stop_times;
  // parent station IDs are never referenced directly. We propagate child routes and
  // departures up to the parent so parent stations appear on the map with correct badges.
  const childToParent = new Map<string, string>();
  for (const stop of gtfs.stops ?? []) {
    if (stop.parent_station) childToParent.set(stop.stop_id, stop.parent_station);
  }

  for (const st of gtfs.stopTimes ?? []) {
    const trip = tripById.get(st.trip_id);
    if (!trip) continue;
    if (!routesByStop.has(st.stop_id)) routesByStop.set(st.stop_id, new Set());
    routesByStop.get(st.stop_id)!.add(trip.route_id);

    // Propagate route up to parent station
    const parentId = childToParent.get(st.stop_id);
    if (parentId) {
      if (!routesByStop.has(parentId)) routesByStop.set(parentId, new Set());
      routesByStop.get(parentId)!.add(trip.route_id);
    }

    // Per-stop departure collection
    const grp = tripGroupByTripId.get(st.trip_id);
    if (grp) {
      const timeStr = st.departure_time || st.arrival_time;
      if (timeStr) {
        const parts = timeStr.split(':');
        const mins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        if (Number.isFinite(mins)) {
          const gKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}`;
          let stopMap = stopDepsByGroup.get(gKey);
          if (!stopMap) { stopMap = new Map(); stopDepsByGroup.set(gKey, stopMap); }
          // Only count first visit per (trip, stop) — loop routes visit the terminus
          // at both the start and end of each trip, which would otherwise interleave
          // outbound and inbound times to produce a falsely short headway (AI-121).
          let visitSet = stopFirstVisit.get(st.trip_id);
          if (!visitSet) { visitSet = new Set(); stopFirstVisit.set(st.trip_id, visitSet); }
          if (!visitSet.has(st.stop_id)) {
            visitSet.add(st.stop_id);
            // Add departure to child stop
            let arr = stopMap.get(st.stop_id);
            if (!arr) { arr = []; stopMap.set(st.stop_id, arr); }
            arr.push(mins);
            // Propagate to parent station so it also gets headways
            if (parentId) {
              let parentArr = stopMap.get(parentId);
              if (!parentArr) { parentArr = []; stopMap.set(parentId, parentArr); }
              parentArr.push(mins);
            }
          }
        }
      }
    }
  }

  // Unique route short names per stop — more accurate hub detection than raw route_id count,
  // which inflates when agencies use separate IDs per direction or schedule period.
  const uniqueShortsByStop = new Map<string, number>();
  for (const [stopId, rids] of routesByStop) {
    const shorts = new Set<string>();
    for (const rid of rids) {
      const sn = routeById.get(rid)?.route_short_name;
      if (sn) shorts.add(sn);
    }
    uniqueShortsByStop.set(stopId, shorts.size);
  }

  const servedStopIds = new Set((gtfs.stopTimes ?? []).map(st => st.stop_id));
  for (const stop of gtfs.stops ?? []) {
    // Include child stops referenced in stop_times, AND parent stations whose children
    // gave them routes via the propagation above (AI-117).
    const isServedParent = stop.location_type === '1' && routesByStop.has(stop.stop_id);
    if (!servedStopIds.has(stop.stop_id) && !isServedParent) continue;

    const routeIds = Array.from(routesByStop.get(stop.stop_id) ?? []);
    // Hub: a named station/terminal (location_type=1) or served by 3+ distinct routes.
    // Used to show interchange markers at regional zoom levels (zoom 11–12).
    const uniqueRoutes = uniqueShortsByStop.get(stop.stop_id) ?? 0;
    const isHub = stop.location_type === '1' || uniqueRoutes >= 3;
    const isRail = routeIds.some(rid => {
      const r = routeById.get(rid);
      const rt = r?.route_type;
      // type 1 = subway/metro, type 2 = commuter rail; exclude type 0 (streetcar/tram)
      return rt === '1' || rt === '2';
    });

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
        isHub,
        isRail,
      },
    } as any);
  }

  // Resolve per-stop headways + stopOrder onto route features.
  // stopDepsByGroup is keyed at route+direction level (all headsigns combined), so stopHeadways
  // naturally reflect combined service from overlapping headsigns (e.g. VIVA Blue Bernard + Newmarket).
  // We project stops onto the specific feature shape and filter by proximity to exclude stops that
  // belong to a different headsign's extension (e.g. Newmarket stops projected onto Bernard Terminal
  // shape would land far off — ~1 km — and get filtered out).
  //
  // MAX_STOP_DEV_DEG: ~500 m tolerance. Covers legitimate stop offsets from simplified shapes
  // (especially GO rail) while excluding stops on a different branch entirely.
  const MAX_STOP_DEV = 0.0045; // degrees; approx 500 m
  const MAX_STOP_DEV2 = MAX_STOP_DEV * MAX_STOP_DEV;

  for (const [feature, { shortName, dirId, day }] of featureStopHeadwaySlots) {
    const gKey = `${shortName}::${dirId}::${day}`;
    const stopMap = stopDepsByGroup.get(gKey);
    if (!stopMap) continue;

    // Step 1: compute all-day, per-period, and per-hour headways for every stop in the route+dir group.
    const allStopHw: Record<string, number> = {};
    const allStopPeriodHw: Record<string, Partial<Record<PeriodKey, number>>> = {};
    const allStopHourHw: Record<string, HeadwayByHour> = {};
    for (const [stopId, times] of stopMap) {
      times.sort((a, b) => a - b);
      const hw = medianHeadwayInWindow(times, 360, 1320);
      if (hw != null) allStopHw[stopId] = hw;
      const byPeriod: Partial<Record<PeriodKey, number>> = {};
      for (const [pk, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
        const ph = medianHeadwayInWindow(times, start, end, 3);
        if (ph != null) byPeriod[pk] = ph;
      }
      if (Object.keys(byPeriod).length > 0) allStopPeriodHw[stopId] = byPeriod;
      // Hourly: use a 90-min window [h*60, h*60+90] so 30-min routes show up with ≥3 departures.
      const byHour: HeadwayByHour = {};
      for (const h of SPARKLINE_HOURS) {
        const hh = medianHeadwayInWindow(times, h * 60, h * 60 + 90, 2);
        byHour[h] = hh;
      }
      allStopHourHw[stopId] = byHour;
    }
    if (Object.keys(allStopHw).length === 0) continue;

    // Step 2: project all stops onto this feature's specific shape, then filter to stops
    // within MAX_STOP_DEV_DEG of the shape (excludes stops from other headsign branches).
    const coords = (feature.geometry as { type: 'LineString'; coordinates: number[][] }).coordinates;
    const shapePts: [number, number][] = coords.map(([lon, lat]) => [lat, lon]);
    const allProjected = projectStopsOntoShape(Object.keys(allStopHw), stopsById, shapePts);
    const onShape = allProjected.filter(p => p.dev2 <= MAX_STOP_DEV2);

    if (onShape.length > 1) {
      feature.properties.stopOrder = onShape.map(p => p.stopId);
      feature.properties.stopPositions = onShape.map(p => Math.round(p.t * 10000) / 10000);
    }

    // Step 3: build stopHeadways from on-shape stops only.
    const stopHeadways: Record<string, number> = {};
    for (const { stopId } of onShape) {
      if (allStopHw[stopId] != null) stopHeadways[stopId] = allStopHw[stopId];
    }
    if (Object.keys(stopHeadways).length === 0) continue;
    feature.properties.stopHeadways = stopHeadways;

    // Per-stop period headways for on-shape stops — used by Corridors to show
    // frequency at the user's chosen TO stop, not just the route terminal.
    const stopPeriodHeadways: Record<string, Partial<Record<PeriodKey, number>>> = {};
    for (const { stopId } of onShape) {
      const periods = allStopPeriodHw[stopId];
      if (periods && Object.keys(periods).length > 0) stopPeriodHeadways[stopId] = periods;
    }
    if (Object.keys(stopPeriodHeadways).length > 0) {
      feature.properties.stopPeriodHeadways = stopPeriodHeadways;
    }

    // Step 4: override feature headway + tier using the terminal stop's headway.
    // "to Niagara Falls GO every 15 min" is wrong — that's trunk frequency, not branch frequency.
    // Only trips that reach the terminal stop contribute to its headway, so it correctly reflects
    // how often a train actually goes there. Falls back to all-stop median if terminal has no data.
    if (feature.properties.tier !== 'span') {
      const terminalId = onShape[onShape.length - 1]?.stopId;
      const terminalHw = terminalId ? allStopHw[terminalId] : undefined;
      // Use midday as the headline headway — consistent with the "Midday" filter period and
      // avoids all-day averages being inflated by low-frequency overnight/early-morning runs.
      const terminalMiddayHw = terminalId ? allStopPeriodHw[terminalId]?.['midday'] : undefined;
      const hwVals = Object.values(stopHeadways).sort((a, b) => a - b);
      const mid = Math.floor(hwVals.length / 2);
      const allStopMedian = hwVals.length % 2 === 0
        ? Math.round((hwVals[mid - 1] + hwVals[mid]) / 2)
        : hwVals[mid];
      const headway = terminalMiddayHw ?? terminalHw ?? allStopMedian;
      feature.properties.headway = headway;

      let tier = 'infrequent';
      for (const { max } of HEADWAY_TIERS) {
        if (headway <= max) {
          tier = max === Infinity ? 'infrequent' : String(max);
          break;
        }
      }
      feature.properties.tier = tier;

      // Minimum stop headway — the best frequency available anywhere on this route.
      // Used by passesRouteFilter so routes with high-frequency sections aren't excluded
      // even when the terminal headway doesn't meet the active threshold (pairs with AI-97 clipping).
      feature.properties.minStopHeadway = hwVals[0];
    }

    // Step 5: set headwayByPeriod from the terminal stop only.
    // "to Niagara Falls GO every 30 min AM Peak" means trains arrive at Niagara Falls every
    // 30 min — not at a station 75 km away. Using the full-shape median inflates the period
    // headway by borrowing from other headsigns that share the trunk but don't go to the
    // terminal. The terminal stop (highest t in onShape) is the authoritative source.
    //
    // minStopHeadwayByPeriod uses all on-shape stops so the filter correctly shows the route
    // when ANY part of it meets the active threshold (pairs with AI-97 shape clipping).
    const terminalStopId = onShape[onShape.length - 1]?.stopId;
    const terminalPeriodHw = terminalStopId ? allStopPeriodHw[terminalStopId] : undefined;
    const periodMedians: HeadwayByPeriod = {};
    const periodMins: Partial<Record<PeriodKey, number>> = {};
    for (const pk of Object.keys(PERIODS) as PeriodKey[]) {
      periodMedians[pk] = terminalPeriodHw?.[pk] ?? null;
      const allVals = onShape
        .map(({ stopId }) => allStopPeriodHw[stopId]?.[pk])
        .filter((v): v is number => v != null);
      if (allVals.length > 0) periodMins[pk] = Math.min(...allVals);
    }
    feature.properties.headwayByPeriod = periodMedians;
    feature.properties.minStopHeadwayByPeriod = periodMins;

    // Hourly headways from terminal stop for the sparkline.
    const terminalHourHw = terminalStopId ? allStopHourHw[terminalStopId] : undefined;
    if (terminalHourHw) {
      feature.properties.headwayByHour = terminalHourHw;
    }
  }

  // AI-58: short-turn variant metadata — attach significant shape variants (≥15% of trips)
  // to each feature as shortTurnVariants. Per-variant headways require phase-1 refactoring;
  // this pass captures trip share and headsign so the UI can show "X% go to [headsign]".
  // Only attaches to direction-0 features (the map-visible direction).
  const dirTripTotals = new Map<string, number>();
  for (const [key, counts] of shapeCounts) {
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    dirTripTotals.set(key, total);
  }
  // Build headsign per shapeId for annotation
  const headsignByShape = new Map<string, string>(); // shapeId → most common headsign
  for (const [hKey, hShapeCounts] of headsignShapeCounts) {
    const parts = hKey.split('::');
    const headsign = parts.slice(2).join('::'); // headsign may contain '::'
    for (const [sid] of hShapeCounts) {
      if (!headsignByShape.has(sid)) headsignByShape.set(sid, headsign);
    }
  }
  for (const feature of features) {
    const dirId = String(feature.properties.directionId ?? '0');
    if (dirId !== '0') continue; // only direction-0 features are map-visible
    const routeId = feature.properties.routeId as string;
    const key = `${routeId}::${dirId}`;
    const counts = shapeCounts.get(key);
    if (!counts) continue;
    const total = dirTripTotals.get(key) ?? 0;
    if (total === 0) continue;
    // Identify the dominant cluster's shape IDs
    const dominantShapes = routeDirToAnalysisShapes.get(key) ?? new Set<string>();
    const variants: { headsign: string | null; tripShare: number }[] = [];
    // Group non-dominant shapes by headsign, sum their trip counts
    const headsignTripCounts = new Map<string | null, number>();
    for (const [sid, tripCount] of counts) {
      if (dominantShapes.has(sid)) continue;
      const share = tripCount / total;
      if (share < 0.15) continue; // only variants with ≥15% of trips
      const hs = headsignByShape.get(sid) ?? null;
      headsignTripCounts.set(hs, (headsignTripCounts.get(hs) ?? 0) + tripCount);
    }
    for (const [hs, tripCount] of headsignTripCounts) {
      variants.push({ headsign: hs ? cleanHeadsign(hs, feature.properties.routeShortName as string, feature.properties.routeLongName as string | null) : null, tripShare: Math.round(tripCount / total * 100) });
    }
    if (variants.length > 0) {
      feature.properties.shortTurnVariants = variants.sort((a, b) => b.tripShare - a.tripShare);
    }
  }

  // AI-182: worst-direction headway — both directions must meet the filter threshold.
  // Compute the max headway across all directions per route (keyed by routeShortName),
  // then stamp every feature with that value so the client filter can gate on it.
  const routeWorstHw = new Map<string, number>();
  const routeWorstHwByPeriod = new Map<string, HeadwayByPeriod>();
  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const hw = f.properties.headway as number | null;
    if (hw != null) {
      const cur = routeWorstHw.get(sn) ?? 0;
      if (hw > cur) routeWorstHw.set(sn, hw);
    }
    const byPeriod = f.properties.headwayByPeriod as HeadwayByPeriod | undefined;
    if (byPeriod) {
      let existing = routeWorstHwByPeriod.get(sn);
      if (!existing) { existing = {}; routeWorstHwByPeriod.set(sn, existing); }
      for (const [pk, v] of Object.entries(byPeriod) as [PeriodKey, number | null][]) {
        if (v != null && (existing[pk] == null || v > existing[pk]!)) existing[pk] = v;
      }
    }
  }
  for (const f of features) {
    const sn = f.properties.routeShortName as string;
    const worst = routeWorstHw.get(sn);
    if (worst != null) f.properties.worstDirectionHeadway = worst;
    const worstByPeriod = routeWorstHwByPeriod.get(sn);
    if (worstByPeriod) f.properties.worstDirectionHeadwayByPeriod = worstByPeriod;
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

  // Build stops index: only stops that appear in at least one feature's stopOrder.
  // Keeps the index small and relevant — no ghost stops from routes we don't display.
  const referencedStopIds = new Set<string>();
  for (const f of features) {
    for (const id of (f.properties.stopOrder as string[] | undefined) ?? []) {
      referencedStopIds.add(id);
    }
  }
  const allStopsById = new Map((gtfs.stops ?? []).map(s => [s.stop_id, s]));
  const stopsIndex: Record<string, StopEntry> = {};
  for (const stopId of referencedStopIds) {
    const s = allStopsById.get(stopId);
    if (!s?.stop_name) continue;
    stopsIndex[stopId] = {
      name: s.stop_name,
      lat: parseFloat(s.stop_lat as unknown as string),
      lon: parseFloat(s.stop_lon as unknown as string),
    };
  }

  // Simplify route LineString coordinates (Douglas-Peucker, ~11m tolerance).
  // Reduces file size for dense networks without visible change at typical zoom levels.
  for (const f of features) {
    if (f.geometry.type === 'LineString') {
      f.geometry.coordinates = simplifyLine(f.geometry.coordinates as number[][], 0.0001);
    }
  }

  const feedInfo = gtfs.feedInfo?.[0];
  const mainFeatures = [...features, ...stopFeatures];

  let livePollingSidecar: Record<string, any> | undefined;
  if (options?.slug) {
    const slug = options.slug;
    const configs = LIVE_POLLING_ROUTES.filter(c => c.slug === slug);
    if (configs.length > 0) {
      livePollingSidecar = {};
      for (const cfg of configs) {
        let headway = cfg.scheduledHeadwayMin;
        let minHw = Infinity;
        for (const f of mainFeatures) {
          const p = f.properties;
          if (p.routeShortName === cfg.displayRouteShortName && p.day === 'Weekday' && p.headway != null) {
            const h = Number(p.headway);
            if (h < minHw) {
              minHw = h;
            }
          }
        }
        if (minHw !== Infinity) {
          headway = minHw;
        }

        const scheduleOffsetMin = computeOffsets(gtfs, cfg);

        livePollingSidecar[cfg.displayRouteShortName] = {
          scheduledHeadwayMin: headway,
          scheduleOffsetMin,
        };
      }
    }
  }

  return {
    geojson: JSON.stringify({ type: 'FeatureCollection', features: mainFeatures }),
    corridorsGeojson: JSON.stringify({ type: 'FeatureCollection', features: corridorFeatures }),
    stopsJson: JSON.stringify(stopsIndex),
    featureCount: mainFeatures.length,
    center,
    feedExpiry: feedInfo?.feed_end_date ?? null,
    feedVersion: feedInfo?.feed_version ?? null,
    livePollingSidecar,
  };
}

function computeOffsets(gtfs: any, cfg: any) {
  const routeIds = new Set(cfg.routeIds);
  const targetStops = new Set(Object.keys(cfg.targetStops));
  
  const childToParent = new Map<string, string>();
  for (const stop of gtfs.stops ?? []) {
    if (stop.parent_station) {
      childToParent.set(stop.stop_id, stop.parent_station);
    }
  }

  const weekdayServices = new Set<string>();
  for (const cal of gtfs.calendar ?? []) {
    if (
      cal.monday === '1' ||
      cal.tuesday === '1' ||
      cal.wednesday === '1' ||
      cal.thursday === '1' ||
      cal.friday === '1'
    ) {
      weekdayServices.add(cal.service_id);
    }
  }

  const weekdayTrips = (gtfs.trips ?? []).filter((t: any) => 
    routeIds.has(t.route_id) && weekdayServices.has(t.service_id)
  );

  const stopTimesByTrip = new Map<string, any[]>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!stopTimesByTrip.has(st.trip_id)) {
      stopTimesByTrip.set(st.trip_id, []);
    }
    stopTimesByTrip.get(st.trip_id)!.push(st);
  }

  const offsetsAccum: Record<string, Record<string, number[]>> = {};

  function timeToMins(t: string): number {
    const parts = t.split(':').map(Number);
    if (parts.length < 2) return 0;
    const h = parts[0];
    const m = parts[1];
    const s = parts[2] ?? 0;
    return h * 60 + m + s / 60;
  }

  for (const trip of weekdayTrips) {
    const stList = stopTimesByTrip.get(trip.trip_id);
    if (!stList || stList.length === 0) continue;

    stList.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));

    const t0 = timeToMins(stList[0].departure_time || stList[0].arrival_time);
    const dir = trip.direction_id ?? '0';

    if (!offsetsAccum[dir]) offsetsAccum[dir] = {};

    for (const st of stList) {
      const parent = childToParent.get(st.stop_id) ?? st.stop_id;
      const matchedTarget = targetStops.has(st.stop_id) ? st.stop_id : (targetStops.has(parent) ? parent : null);
      if (!matchedTarget) continue;

      const ts = timeToMins(st.arrival_time || st.departure_time);
      const diff = ts - t0;
      if (diff < 0) continue;

      if (!offsetsAccum[dir][matchedTarget]) {
        offsetsAccum[dir][matchedTarget] = [];
      }
      offsetsAccum[dir][matchedTarget].push(diff);
    }
  }

  const result: Record<string, Record<string, number>> = {};
  for (const [dir, stops] of Object.entries(offsetsAccum)) {
    result[dir] = {};
    for (const [stopId, diffs] of Object.entries(stops)) {
      if (diffs.length === 0) continue;
      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      result[dir][stopId] = Math.round(avg);
    }
  }

  return result;
}
