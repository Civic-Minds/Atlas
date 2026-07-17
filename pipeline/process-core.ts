/**
 * Shared processing core: GTFS zip buffer → GeoJSON string + computed center.
 * Used by process-gtfs.ts (local zip) and refresh.ts (downloaded feeds).
 */
import { parseGtfsZip } from './parseGtfs.js';
import type { GtfsData } from '../types/gtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria } from './transit-phase2.js';
import { calculateCorridors } from './transit-logic.js';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar.js';
import { DEFAULT_CRITERIA } from './defaults.js';
import { normalizeGtfs, type GtfsPreprocess, type GtfsTransformOptions } from './preprocess/run.js';
import { resolveDisplayHeadsign } from '../shared/headsignDisplay.js';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { TIME_PERIODS, SPARKLINE_HOURS, type PeriodKey, type HeadwayByPeriod } from '../shared/config.js';
import { DAY_TYPES, type DayType } from '../types/gtfs.js';
import { ALL_DAYS } from '../shared/dayTypes.js';
import { t2m } from './transit-utils.js';
import { computePeriodHeadways, headwayToTier, medianHeadwayInWindow, TIER_RANK } from './headway-utils.js';
import { computeRouteBaseFares, detectBusSubType } from './route-metadata.js';
import { buildStopsMeta } from './stopsMeta.js';
import { projectStopsOntoShape, simplifyLine } from './geometry.js';
import { computeLivePollingOffsets, computeLiveTripStopTimes } from './live-polling-offsets.js';
import { annotateShortTurnVariants, buildShapeSelectionContext } from './shape-selection.js';
import { stampWorstDirectionHeadways } from './worst-direction.js';
import type { GeoJsonFeature, StopEntry } from './geojson-types.js';

export type { GtfsPreprocess };
export type { HeadwayByPeriod };
export type HeadwayByHour = Partial<Record<number, number | null>>;
export type { GeoJsonFeature, StopEntry };

const PERIODS = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }]),
) as Record<string, { start: number; end: number }>;

export interface ProcessOptions extends GtfsTransformOptions {
  slug?: string;
  manualBaseFare?: number;
}


export interface ProcessResult {
  geojson: string;
  corridorsGeojson: string; // isCorridor features only, served separately
  stopsJson: string; // JSON: Record<stopId, StopEntry> — for Corridors stop search
  tripsJson: string; // JSON: Record<tripId, {d: directionId, h: headsign|null}> for live vehicle enrichment
  stopsMetaJson: string; // JSON: StopsMetaFile — per-stop facts (routes, direction) for external consumers
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
  gtfs = normalizeGtfs(gtfs, options, onStatus);

  const routeBaseFares = computeRouteBaseFares(gtfs, options?.manualBaseFare);

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

  const refDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates, gtfs.trips);
  // Union all 7 days, not just Monday/Saturday/Sunday — an agency whose weekday
  // service runs e.g. Tuesday-Friday only (no Monday service at all) had every
  // one of its route::dir keys silently excluded from shape selection, dropping
  // otherwise-valid phase1/phase2 results with `if (!shapeId) continue` further
  // down (Fredericksburg Regional Transit pattern).
  const activeForShapes = new Set<string>(
    ALL_DAYS.flatMap(day => [...getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], day, refDate)]),
  );
  const shapes = buildShapeSelectionContext(gtfs, routeById, activeForShapes);
  const {
    shapeById,
    shapeCounts,
    headsignDisplayShape,
    routeDirToHeadsign,
    routeDirToDisplayShape,
    routeDirToAnalysisShapes,
    shapeFilterForPhase1,
    lastStopByTrip,
    stopNameById,
  } = shapes;

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
  const serviceIdToDayType = new Map<string, DayType>();
  for (const dayType of DAY_TYPES) {
    const calDay = dayType === 'Weekday' ? 'Monday' : dayType;
    for (const id of getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], calDay, refDate)) {
      if (!serviceIdToDayType.has(id)) serviceIdToDayType.set(id, dayType);
    }
  }
  const tripGroupByTripId = new Map<string, { routeId: string; shortName: string; dirId: string; dayType: string; headsign: string | null; shapeId: string | null }>();
  for (const trip of gtfs.trips ?? []) {
    const dayType = serviceIdToDayType.get(trip.service_id);
    if (!dayType) continue;
    // Use shortName as the group key so agencies with multiple route_ids per line (e.g. GO Transit
    // date-prefixed IDs like 04260626-LW / 06260926-LW) merge into one combined stop frequency group.
    const route = routeById.get(trip.route_id);
    const shortName = route?.route_short_name ?? trip.route_id;
    const longName = route?.route_long_name?.trim() ?? null;
    let rawHeadsign = trip.trip_headsign?.trim() || null;
    if (!rawHeadsign) {
      const lastStopId = lastStopByTrip.get(trip.trip_id);
      if (lastStopId) rawHeadsign = stopNameById.get(lastStopId) ?? null;
    }
    const headsign = resolveDisplayHeadsign(rawHeadsign, shortName, longName);
    tripGroupByTripId.set(trip.trip_id, {
      routeId: trip.route_id,
      shortName,
      dirId: String(trip.direction_id ?? '0'),
      dayType,
      headsign,
      shapeId: trip.shape_id || null,
    });
  }
  // stopDepsByGroup["routeId::dirId::dayType"] → stopId → sorted departure minutes
  const stopDepsByGroup = new Map<string, Map<string, number[]>>();
  // Headsign-scoped deps for display trunk headways (RGRTA 21/22: combined trunk deps
  // from competing branches produced misleading "every 13–30 min" ranges).
  const stopDepsByHeadsignGroup = new Map<string, Map<string, number[]>>();
  // Shape-scoped deps: some feeds (NRT 301/401) reuse one generic headsign across trips
  // on genuinely different shapes (e.g. a short direct pattern and the return leg of a
  // different, unrelated corridor that happens to also end near the same hub stop), so
  // headsign alone doesn't separate them. Keying by the feature's own display shape_id
  // catches this — two trips only pool together here if they trace the same physical path.
  const stopDepsByShapeGroup = new Map<string, Map<string, number[]>>();
  // Track first visit per (trip_id, stop_id) to avoid double-counting loop routes
  // where the terminus appears at both the start and end of the same trip.
  const stopFirstVisit = new Map<string, Set<string>>();

  // Build route features; deduplicate by (routeShortName, directionId, day) so feeds with
  // multiple schedule-period route IDs (e.g. GO Transit 04260626-LW / 06260926-LW) don't
  // emit two overlapping features per line. When duplicates exist, keep the lower headway
  // (more frequent / more trips active in the analysis window).
  const dedupedFeatures = new Map<string, GeoJsonFeature>();
  // Feature → the shapeId it was actually built from, so the per-stop headway
  // resolution loop below can pool departures scoped to that exact physical path.
  const featureShapeId = new Map<GeoJsonFeature, string>();
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
    // Normalize headsign for dedup using the same clean function as display.
    // This collapses raw variants (e.g. "Hancock", "To Hancock Plaza") that clean to the same label.
    const routeLongName = route?.route_long_name?.trim() ?? null;
    const cleanedForDedup = resolveDisplayHeadsign(result.headsign, shortName, routeLongName);
    // Deduplicate by (shortName, dir, day, headsign) so separate directions and terminuses
    // aren't collapsed together.
    const dedupeKey = cleanedForDedup
      ? `${shortName}::${result.dir}::${result.day}::${cleanedForDedup}`
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

    const newFeature: GeoJsonFeature = {
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
        headwayByPeriod: computePeriodHeadways(result.times),
        headwayByHour: (() => {
          const byHour: HeadwayByHour = {};
          for (const h of SPARKLINE_HOURS) {
            // Two departures can be an accidental cluster on a sparse route (e.g. HRT 967).
            // Require three before exposing an hourly sparkline headway.
            byHour[h] = medianHeadwayInWindow(result.times, h * 60, h * 60 + 90, 3);
          }
          return byHour;
        })(),
        routeShortName: shortName,
        routeLongName: route?.route_long_name ?? null,
        routeColor: route?.route_color ?? null,
        routeType: parseInt(result.routeType || '3'),
        busSubType: detectBusSubType(result.routeType, shortName, route?.route_long_name ?? null, options?.slug),
        baseFare: routeBaseFares.get(result.route) ?? null,
        day: result.day,
        headsign: resolveDisplayHeadsign(result.headsign, shortName, routeLongName)
          ?? routeDirToHeadsign.get(key) ?? null,
      },
    };
    dedupedFeatures.set(dedupeKey, newFeature);
    featureShapeId.set(newFeature, shapeId);
  }
  const features = [...dedupedFeatures.values()];

  // Attach per-stop headways — populated once stop_times are scanned below.
  // We store a reference to the pending map so the loop below can fill it.
  const featureStopHeadwaySlots = new Map<GeoJsonFeature, { shortName: string; dirId: string; day: string }>();
  for (const feature of features) {
    const p = feature.properties;
    if (p.routeShortName != null && p.directionId != null && p.day) {
      featureStopHeadwaySlots.set(feature, {
        shortName: p.routeShortName as string,
        dirId: String(p.directionId),
        day: p.day as string,
      });
    }
  }

  // Extract stops for clickable stations
  onStatus?.('Deriving per-stop metadata (routes, direction)...');
  const stopsMeta = buildStopsMeta(gtfs);
  const stopDirections = new Map<string, string>();
  for (const s of stopsMeta.stops) {
    if (s.direction) stopDirections.set(s.id, s.direction);
  }

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
        const mins = t2m(timeStr);
        if (mins !== null) {
          const gKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}`;
          let stopMap = stopDepsByGroup.get(gKey);
          if (!stopMap) { stopMap = new Map(); stopDepsByGroup.set(gKey, stopMap); }
          const pushDep = (map: Map<string, number[]>, stopId: string, mins: number) => {
            let arr = map.get(stopId);
            if (!arr) { arr = []; map.set(stopId, arr); }
            arr.push(mins);
          };
          // Only count first visit per (trip, stop) — loop routes visit the terminus
          // at both the start and end of each trip, which would otherwise interleave
          // outbound and inbound times to produce a falsely short headway (AI-121).
          let visitSet = stopFirstVisit.get(st.trip_id);
          if (!visitSet) { visitSet = new Set(); stopFirstVisit.set(st.trip_id, visitSet); }
          if (!visitSet.has(st.stop_id)) {
            visitSet.add(st.stop_id);
            pushDep(stopMap, st.stop_id, mins);
            if (grp.headsign) {
              const hsKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}::${grp.headsign}`;
              let hsMap = stopDepsByHeadsignGroup.get(hsKey);
              if (!hsMap) { hsMap = new Map(); stopDepsByHeadsignGroup.set(hsKey, hsMap); }
              pushDep(hsMap, st.stop_id, mins);
            }
            if (grp.shapeId) {
              const shKey = `${grp.shapeId}::${grp.dayType}`;
              let shMap = stopDepsByShapeGroup.get(shKey);
              if (!shMap) { shMap = new Map(); stopDepsByShapeGroup.set(shKey, shMap); }
              pushDep(shMap, st.stop_id, mins);
            }
            // Propagate to parent station so it also gets headways (only count first visit to parent per trip)
            if (parentId && !visitSet.has(parentId)) {
              visitSet.add(parentId);
              pushDep(stopMap, parentId, mins);
              if (grp.headsign) {
                const hsKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}::${grp.headsign}`;
                let hsMap = stopDepsByHeadsignGroup.get(hsKey);
                if (!hsMap) { hsMap = new Map(); stopDepsByHeadsignGroup.set(hsKey, hsMap); }
                pushDep(hsMap, parentId, mins);
              }
              if (grp.shapeId) {
                const shKey = `${grp.shapeId}::${grp.dayType}`;
                let shMap = stopDepsByShapeGroup.get(shKey);
                if (!shMap) { shMap = new Map(); stopDepsByShapeGroup.set(shKey, shMap); }
                pushDep(shMap, parentId, mins);
              }
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
        stopCode: stop.stop_code || null,
        routeIds,
        isHub,
        isRail,
        direction: stopDirections.get(stop.stop_id) ?? null,
      },
    } as any);
  }

  // Resolve per-stop headways + stopOrder onto route features.
  // Use headsign-scoped departures for a feature whenever available. The route-level map is
  // still the fallback for feeds without usable headsigns, but combining branches at shared
  // stops can make a 30-minute route appear to run every 10–15 minutes (NRT 306/318).
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
    const featureHeadsign = feature.properties.headsign as string | null;
    const headsignMap = featureHeadsign
      ? stopDepsByHeadsignGroup.get(`${shortName}::${dirId}::${day}::${featureHeadsign}`)
      : undefined;
    // Shape-scoped is the most specific: prefer it whenever this feature's shape has its
    // own departure history, since headsign text can be reused across genuinely different
    // physical patterns (NRT 301/401 reuse one generic headsign for unrelated shapes).
    const featureShape = featureShapeId.get(feature);
    const shapeMap = featureShape ? stopDepsByShapeGroup.get(`${featureShape}::${day}`) : undefined;
    const metricStopMap = shapeMap ?? headsignMap ?? stopMap;

    // Step 1: compute all-day, per-period, and per-hour headways for every stop in the route+dir group.
    const allStopHw: Record<string, number> = {};
    const allStopPeriodHw: Record<string, Partial<Record<PeriodKey, number>>> = {};
    const allStopHourHw: Record<string, HeadwayByHour> = {};
    for (const [stopId, times] of metricStopMap) {
      times.sort((a, b) => a - b);
      // Prefer midday (9–15h) then PM peak (15–19h) rather than a raw all-day window.
      // An all-day median is skewed by peak clusters: Halifax 330 inbound has 9 AM trips
      // in a 105-min window → all-day median gap = 10 min despite no off-peak service.
      // Midday ?? PM peak correctly returns null for AM-peak-only routes, preventing them
      // from appearing with a misleading green dot in the stop card.
      const hw = medianHeadwayInWindow(times, 540, 900, 3)   // midday 9–15h
              ?? medianHeadwayInWindow(times, 900, 1140, 3);  // PM peak 15–19h
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
        const hh = medianHeadwayInWindow(times, h * 60, h * 60 + 90, 3);
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
      let headway = terminalMiddayHw ?? terminalHw ?? allStopMedian;
      
      // If the terminal stop is shared, the combined terminal headway might be lower (better)
      // than the branch-specific headway. Do not override with the combined headway in that case.
      // Only override/degrade to the terminal headway if it is less frequent (higher) than branch headway.
      const branchHw = feature.properties.headway as number | null;
      if (branchHw != null && headway < branchHw) {
        headway = branchHw;
      }
      feature.properties.headway = headway;

      // AI-220: Step 4 may only degrade a tier (branch less frequent than trunk),
      // never improve one. Route tier is owned by phase 2; Step 4 only refines it downward.
      // This prevents AM/PM peak clusters from promoting infrequent routes (e.g. Halifax 330).
      let newTier = headwayToTier(headway);
      const currentRank = TIER_RANK[feature.properties.tier as string] ?? -1;
      if ((TIER_RANK[newTier] ?? -1) > currentRank) {
        feature.properties.tier = newTier;
      }

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
    const branchPeriodHw = feature.properties.headwayByPeriod as HeadwayByPeriod | undefined;
    for (const pk of Object.keys(PERIODS) as PeriodKey[]) {
      const termH = terminalPeriodHw?.[pk] ?? null;
      const bH = branchPeriodHw?.[pk] ?? null;
      if (bH == null) {
        periodMedians[pk] = termH;
      } else if (termH == null) {
        periodMedians[pk] = bH;
      } else {
        periodMedians[pk] = Math.max(bH, termH);
      }
      const allVals = onShape
        .map(({ stopId }) => allStopPeriodHw[stopId]?.[pk])
        .filter((v): v is number => v != null);
      if (allVals.length > 0) periodMins[pk] = Math.min(...allVals);
    }
    feature.properties.headwayByPeriod = periodMedians;
    feature.properties.minStopHeadwayByPeriod = periodMins;

    // Headsign-scoped trunk minimums for route-card range display. minStopHeadwayByPeriod
    // stays route-wide (combined deps) so map filters still show routes when any section qualifies.
    const featHeadsign = feature.properties.headsign as string | null;
    if (featHeadsign) {
      const hsStopMap = stopDepsByHeadsignGroup.get(`${shortName}::${dirId}::${day}::${featHeadsign}`);
      if (hsStopMap) {
        const hsPeriodHw: Record<string, Partial<Record<PeriodKey, number>>> = {};
        for (const [stopId, times] of hsStopMap) {
          times.sort((a, b) => a - b);
          const byPeriod: Partial<Record<PeriodKey, number>> = {};
          for (const [pk, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
            const ph = medianHeadwayInWindow(times, start, end, 3);
            if (ph != null) byPeriod[pk] = ph;
          }
          if (Object.keys(byPeriod).length > 0) hsPeriodHw[stopId] = byPeriod;
        }
        const headsignPeriodMins: Partial<Record<PeriodKey, number>> = {};
        for (const pk of Object.keys(PERIODS) as PeriodKey[]) {
          const vals = onShape
            .map(({ stopId }) => hsPeriodHw[stopId]?.[pk])
            .filter((v): v is number => v != null);
          if (vals.length > 0) headsignPeriodMins[pk] = Math.min(...vals);
        }
        if (Object.keys(headsignPeriodMins).length > 0) {
          feature.properties.headsignMinStopHeadwayByPeriod = headsignPeriodMins;
        }
      }
    }

    // Hourly headways from terminal stop for the sparkline.
    const terminalHourHw = terminalStopId ? allStopHourHw[terminalStopId] : undefined;
    const branchHourHw = feature.properties.headwayByHour as HeadwayByHour | undefined;
    if (branchHourHw) {
      const mergedHourHw: HeadwayByHour = {};
      for (const h of SPARKLINE_HOURS) {
        const termH = terminalHourHw?.[h] ?? null;
        const bH = branchHourHw[h] ?? null;
        if (bH == null) {
          mergedHourHw[h] = termH;
        } else if (termH == null) {
          mergedHourHw[h] = bH;
        } else {
          mergedHourHw[h] = Math.max(bH, termH);
        }
      }
      feature.properties.headwayByHour = mergedHourHw;
    } else if (terminalHourHw) {
      feature.properties.headwayByHour = terminalHourHw;
    }
  }

  annotateShortTurnVariants(features, shapes);
  stampWorstDirectionHeadways(features);

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
  const dayTypes: DayType[] = [...DAY_TYPES];
  for (const d of dayTypes) {
    const dayCfg = DEFAULT_CRITERIA.dayTypes[d];
    if (!dayCfg) continue;
    const corrs = calculateCorridors(gtfs, d, dayCfg.timeWindow.start, dayCfg.timeWindow.end);
    for (const c of corrs) {
      const a = stopCoords.get(c.stopA);
      const b = stopCoords.get(c.stopB);
      if (!a || !b) continue;
      // Skip long straight-line chords (cross water, look wrong for long-distance)
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      if (Math.sqrt(dx * dx + dy * dy) > 0.05) continue; // ~5km+ at this lat
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
          tier: headwayToTier(h),
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

        const scheduleOffsetMin = computeLivePollingOffsets(gtfs, cfg);
        const tripStopTimes = computeLiveTripStopTimes(gtfs, cfg);

        livePollingSidecar[cfg.displayRouteShortName] = {
          scheduledHeadwayMin: headway,
          scheduleOffsetMin,
          tripStopTimes,
        };
      }
    }
  }

  // Build trips lookup for live vehicle enrichment (agencies whose GTFS-RT omits directionId/headsign)
  const tripsLookup: Record<string, { d: number; h: string | null }> = {};
  for (const trip of gtfs.trips ?? []) {
    const h = trip.trip_headsign?.trim() || null;
    tripsLookup[trip.trip_id] = { d: Number(trip.direction_id ?? 0), h };
  }

  return {
    geojson: JSON.stringify({ type: 'FeatureCollection', features: mainFeatures }),
    corridorsGeojson: JSON.stringify({ type: 'FeatureCollection', features: corridorFeatures }),
    stopsJson: JSON.stringify(stopsIndex),
    tripsJson: JSON.stringify(tripsLookup),
    stopsMetaJson: JSON.stringify(stopsMeta),
    featureCount: mainFeatures.length,
    center,
    feedExpiry: feedInfo?.feed_end_date ?? null,
    feedVersion: feedInfo?.feed_version ?? null,
    livePollingSidecar,
  };
}
