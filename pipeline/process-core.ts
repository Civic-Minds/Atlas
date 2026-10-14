/**
 * Shared processing core: GTFS zip buffer → GeoJSON string + computed center.
 * Used by process-gtfs.ts (local zip) and refresh.ts (downloaded feeds).
 */
import { parseGtfsZip } from './parseGtfs.js';
import { computeRunningTimes, runningTimesJson } from './runningTime.js';
import { pickRepresentativeWeekday } from './representativeWeekday.js';
import type { GtfsData, AnalysisResult, RawRouteDepartures } from '../types/gtfs.js';
import { computeRawDepartures } from './transit-phase1.js';
import { applyAnalysisCriteria, BURST_MAX_SPAN_MINUTES, determineTierWithEdgeGapAllowance, previousNightTailDays } from './transit-phase2.js';
import { calculateCorridors } from './transit-logic.js';
import { detectReferenceDate, getActiveServiceIds } from './transit-calendar.js';
import { DEFAULT_CRITERIA, getTiersForCriteria } from './defaults.js';
import { normalizeGtfs, type GtfsPreprocess, type GtfsTransformOptions } from './preprocess/run.js';
import { validateGtfs, type ValidationReport } from './validation.js';
import { resolveDisplayHeadsign } from '../shared/headsignDisplay.js';
import { routeGroupKey } from '../shared/routeGroupKey.js';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { PERIOD_KEYS, TIME_PERIODS, SPARKLINE_HOURS, type PeriodKey, type HeadwayByPeriod, type HeadwayByPeriodMaxGap, type HeadwayByPeriodSustained } from '../shared/config.js';
import { ROUTE_ARTIFACT_SCHEMA_VERSION } from '../shared/artifactSchema.js';
import { DAY_TYPES, WEEKDAYS, type DayName, type DayType } from '../types/gtfs.js';
import { ALL_DAYS } from '../shared/dayTypes.js';
import { expandFrequencyWindow, expandTripFrequencyWindows, isSingleTripFrequencyWindow, parseFrequencyWindow, SINGLE_TRIP_WINDOW_MAX_DEPARTURES, SINGLE_TRIP_WINDOW_SPAN_TOLERANCE_MIN, t2m, type FrequencyWindow } from './transit-utils.js';
import { adaptiveMedianHeadwayInWindow, computeHourMaxGaps, computePeriodHeadways, computePeriodHeadwayRanges, computePeriodMaxGaps, computePeriodSustained, computeResearchFrequentService, forCrossMidnightWindow, hasSustainedFrequentService, hasSustainedNightService, headsignOverlapMinHeadway, headwayToTier, isThinAllDayTerminalSample, isUnevenTwoGapMiddayTerminalSample, medianHeadwayInWindow, MIN_ALL_DAY_TERMINAL_DEPARTURES, nightServiceDepartureTimes, NIGHT_SERVICE_WINDOW_END_MIN, resolveTerminalHeadline, resolveTerminalPeriodHeadway, sustainedMedianHeadwayInWindow, TIER_RANK } from './headway-utils.js';
import { computeRouteBaseFares, detectBusSubType } from './route-metadata.js';
import { buildStopsMeta } from './stopsMeta.js';
import { clipLineBetweenPositions, clipLineBetweenStops, projectStopsOntoShape, simplifyLine } from './geometry.js';
import { computeLivePollingOffsets, computeLiveTripStopTimes } from './live-polling-offsets.js';
import { annotateShortTurnVariants, buildShapeSelectionContext } from './shape-selection.js';
import { stampWorstDirectionHeadways, stampRouteIrregularDirection } from './worst-direction.js';
import type { GeoJsonFeature, StopEntry } from './geojson-types.js';
import { assessFeedQuality, type FeedQuality } from '../shared/feedQuality.js';
import { effectiveFeedExpiry } from './feedFreshness.js';
import { recordedFeedExpiry } from './refreshMeta.js';
import { routeDataQualityWarningForShape } from './routeDataQuality.js';
import { deriveRouteBranch } from '../shared/routeBranch.js';
import { isRailLikeRoute } from '../shared/modes.js';
import { computePeriodCoverageHeadways } from './headway-utils.js';
import { makeShapeCoverChecker } from './shapeCoverage.js';
import { annotateSharedStretches, isPoolablePattern } from './sharedStretch.js';
import { decideDedupe, runsInDay, type DedupePattern } from './featureDedupe.js';
import { decideHeadline, decidePeriod, liftTierOnDestinationPool, ownStepOneHeadway, pooledStepOneHeadway, settleTier, terminalReading, type PeriodValue } from './routeGrading.js';
import type { SharedStretchPattern } from './sharedStretch.js';
import { buildPooledStopMap, computeStopSharers, pooledHeadwayInWindow, segmentsByTier, type StopSharers } from './stopPools.js';

export type { GtfsPreprocess };
export type { HeadwayByPeriod };
export type HeadwayByHour = Partial<Record<number, number | null>>;
export type { GeoJsonFeature, StopEntry };

/**
 * NRT publishes scheduled evening/night route variants separately from its daytime routes.
 * Those variants are valid scheduled service, but their shorter operating window previously
 * made phase 2 classify them as span/limited service. Keep their period-specific headways while
 * giving them the normal frequency tier used by the map and route cards.
 */
export function normalizeNrtAnalysisResult(result: AnalysisResult): AnalysisResult {
  if (result.tier !== 'span' || !Number.isFinite(result.medianHeadway) || result.medianHeadway <= 0) {
    return result;
  }
  return { ...result, tier: headwayToTier(result.medianHeadway) };
}

// The one-trip-per-window rule (#702, #706) lives in transit-utils so route-level
// (transit-phase1) and stop-level expansion share it.
export type { FrequencyWindow };

/**
 * Return offsets for the repeated departures described by one frequencies.txt row.
 *
 * Per GTFS, start_time/end_time bound when trips start, so departures are
 * generated while `generated < end`. Some exporters (TransLoc, e.g. Coast RTA)
 * instead write one row per scheduled trip: the window is exactly that trip's
 * run time and headway_secs is a meaningless value below it, so the literal
 * expansion invents a second departure just before the window ends (#702).
 * When `tripSpanMinutes` is given and the row is one scheduled trip
 * (isSingleTripFrequencyWindow in transit-utils), only that trip is returned.
 * Long windows (genuine all-day frequency blocks, even when the exporter
 * stretched stop_times to the window) still expand normally.
 */
export function expandFrequencyOffsets(
  firstTripDeparture: number,
  start: number,
  end: number,
  headwayMinutes: number,
  tripSpanMinutes?: number,
  tripFrequencyRowCount?: number,
): number[] {
  if (!Number.isFinite(firstTripDeparture)) return [];
  return expandFrequencyWindow({ start, end, headwayMinutes }, tripSpanMinutes, tripFrequencyRowCount)
    .map(generated => generated - firstTripDeparture);
}

/**
 * True when a frequencies.txt row is one scheduled trip written as a window
 * (#702, #706). Delegates to the shared rule in transit-utils
 * (isSingleTripFrequencyWindow), so the #711 timetable-repeat exemption below
 * and the expansion itself (expandFrequencyWindow) always agree on which rows
 * are single trips, including the #706 single-row layover allowance.
 */
export function isSingleTripWindow(window: FrequencyWindow, tripSpanMinutes?: number, tripFrequencyRowCount?: number): boolean {
  if (!(window.headwayMinutes > 0) || window.end <= window.start) return false;
  const departures = Math.ceil((window.end - window.start) / window.headwayMinutes);
  return isSingleTripFrequencyWindow(window.end - window.start, departures, tripSpanMinutes, tripFrequencyRowCount);
}

/**
 * TransLoc block exports write one frequency trip per vehicle block, timed
 * only at its first stop (the block's start) and last stop (the block's end),
 * with the stops between untimed: waco TL-56 05:00 ... 19:15 across 26 stops
 * with a 05:00-19:15 window every 2807 s, clemson-cat Gold 07:00 ... 18:07.
 * The last stop's time is not one run's offset, so adding each generated
 * departure to it put that stop's service 14 hours late, and since the last
 * stop is the route terminal, the route showed only evening and overnight
 * service (#722).
 *
 * Recognised by that exact signature: exactly two timed stops, the first and
 * last in stop_sequence order, matching the earliest window start and latest
 * window end, with more departures than a single-trip row (#702) has.
 */
export function isStretchedBlockTrip(
  tripStops: ReadonlyArray<{ stop_sequence?: string | number; departure_time?: string; arrival_time?: string }>,
  windows: readonly FrequencyWindow[],
): boolean {
  if (tripStops.length < 2 || windows.length === 0) return false;
  const ordered = [...tripStops].sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  const timeOf = (st: { departure_time?: string; arrival_time?: string }) => t2m(st.departure_time || st.arrival_time || '');
  const timed = ordered.filter(st => timeOf(st) !== null);
  if (timed.length !== 2 || timed[0] !== ordered[0] || timed[1] !== ordered[ordered.length - 1]) return false;
  const first = timeOf(timed[0])!;
  const last = timeOf(timed[1])!;
  const start = Math.min(...windows.map(window => window.start));
  const end = Math.max(...windows.map(window => window.end));
  const departures = windows.reduce((sum, window) => sum + (window.headwayMinutes > 0 && window.end > window.start ? Math.ceil((window.end - window.start) / window.headwayMinutes) : 0), 0);
  return departures > SINGLE_TRIP_WINDOW_MAX_DEPARTURES
    && Math.abs(first - start) <= SINGLE_TRIP_WINDOW_SPAN_TOLERANCE_MIN
    && Math.abs(last - end) <= SINGLE_TRIP_WINDOW_SPAN_TOLERANCE_MIN;
}

/**
 * Departures per frequency trip, used to pick the representative weekday. Same
 * rule as the route and stop levels: single-trip windows count once and
 * overlapping rows dedupe, so phantom departures cannot sway which weekday is
 * picked (#723). Trips with no valid window are absent.
 */
export function frequencyDepartureCounts(
  frequencies: ReadonlyArray<{ trip_id: string; start_time: string; end_time: string; headway_secs: string | number }> | undefined,
  stopTimes: ReadonlyArray<{ trip_id: string; arrival_time?: string; departure_time?: string }> | undefined,
): Map<string, number> {
  const windowsByTripId = new Map<string, FrequencyWindow[]>();
  for (const frequency of frequencies ?? []) {
    const window = parseFrequencyWindow(frequency);
    if (!window) continue;
    const rows = windowsByTripId.get(frequency.trip_id) ?? [];
    rows.push(window);
    windowsByTripId.set(frequency.trip_id, rows);
  }
  const spanBounds = new Map<string, [number, number]>();
  if (windowsByTripId.size > 0) {
    for (const st of stopTimes ?? []) {
      if (!windowsByTripId.has(st.trip_id)) continue;
      const mins = t2m(st.departure_time || st.arrival_time || '');
      if (mins === null) continue;
      const bounds = spanBounds.get(st.trip_id);
      if (!bounds) spanBounds.set(st.trip_id, [mins, mins]);
      else { bounds[0] = Math.min(bounds[0], mins); bounds[1] = Math.max(bounds[1], mins); }
    }
  }
  const counts = new Map<string, number>();
  for (const [tripId, windows] of windowsByTripId) {
    const bounds = spanBounds.get(tripId);
    const count = expandTripFrequencyWindows(windows, bounds ? bounds[1] - bounds[0] : undefined).length;
    if (count > 0) counts.set(tripId, count);
  }
  return counts;
}

/**
 * Offsets for every frequencies.txt row of one trip, with overlapping rows
 * deduplicated (#711): a departure generated by a later row inside an earlier
 * row's window is dropped, so two window sets describing the same hours (uga
 * M Milledge has 07:00-18:30 twice) do not stack. Back-to-back and
 * after-midnight rows (18:30-25:00 then 01:00-02:30) do not overlap and still
 * expand in full. Rows on different trips are not touched: two vehicles with
 * offset windows (terrebonne-parish 21) are real combined service.
 */
export function expandTripFrequencyOffsets(
  firstTripDeparture: number,
  windows: readonly FrequencyWindow[],
  tripSpanMinutes?: number,
): number[] {
  if (!Number.isFinite(firstTripDeparture)) return [];
  return expandTripFrequencyWindows(windows, tripSpanMinutes).map(generated => generated - firstTripDeparture);
}

/** Departures this close (minutes) from different template trips are one departure. */
const COINCIDENT_DEPARTURE_TOLERANCE_MIN = 1;

/**
 * Offsets kept for each template trip of one route, service, direction and
 * stop pattern, once departures that coincide with an earlier trip's are
 * dropped (#711).
 *
 * TransLoc block exports write one frequency trip per vehicle block, and a
 * block that takes over mid-day can restart on top of another block's cycle:
 * clemson-cat Gold_03 starts at 13:45, 0.7 min after Gold_01's 13:44 pass, and
 * both repeat every 1213 s, so every afternoon departure is listed twice and
 * the stop headway drops to 1. Riders see one bus, so a departure within
 * COINCIDENT_DEPARTURE_TOLERANCE_MIN of one already kept (earlier trip in file
 * order wins) is dropped. Offset vehicles (Gold_02 15 min behind Gold_01,
 * terrebonne-parish 21's 7 min) are real extra service and stay.
 */
export function dropCoincidentTemplateDepartures(
  templates: ReadonlyArray<{ first: number; offsets: readonly number[] }>,
): number[][] {
  const kept: number[] = [];
  return templates.map(({ first, offsets }) => {
    const own = offsets.filter(offset => !kept.some(start => Math.abs(start - (first + offset)) <= COINCIDENT_DEPARTURE_TOLERANCE_MIN));
    kept.push(...own.map(offset => first + offset));
    return own;
  });
}

/**
 * Share of a pattern's generated frequency departures that same-pattern
 * scheduled trips must account for before its templates count as a repeat of
 * the timetable.
 */
const TIMETABLE_REPEAT_MIN_SHARE = 0.5;

/**
 * Frequency windows that repeat a timetable the feed also lists as ordinary
 * trips, so their generated departures must not be added again (#711).
 *
 * uga writes a 00:00 template with frequency windows next to the full
 * timetable for the same route and stop pattern (M Milledge: 37 same-pattern
 * scheduled trips plus a template that expands to about 33 more), so counting
 * both stacks every departure. `templates` and `scheduledStartMinutes` must be
 * for one route, service, direction and stop pattern.
 *
 * Two tests, both needed:
 * - Pattern level: same-pattern scheduled starts inside the template windows
 *   must reach half of the departures the templates generate. A few scheduled
 *   extras inside a genuine frequency block (terrebonne-parish 21: 1 start in
 *   a 2-departure window, ~40 generated overall) leave every window expanded.
 * - Window level: only windows that contain at least one same-pattern
 *   scheduled start are dropped. A window the timetable never reaches (say an
 *   evening-only frequency block after a daytime timetable) keeps its service.
 *
 * Window density alone cannot replace the pattern test: uga L's morning
 * windows hold 0.33 scheduled starts per generated departure, below
 * terrebonne's 0.5, yet they repeat the timetable.
 */
export function windowsRepeatedByTimetable(
  templates: ReadonlyArray<{ windows: readonly FrequencyWindow[]; departures: number }>,
  scheduledStartMinutes: readonly number[],
): Set<FrequencyWindow> {
  const repeated = new Set<FrequencyWindow>();
  const generated = templates.reduce((sum, template) => sum + template.departures, 0);
  if (generated === 0 || scheduledStartMinutes.length === 0) return repeated;
  const inWindow = (minute: number, window: FrequencyWindow) => minute >= window.start && minute < window.end;
  const inside = scheduledStartMinutes.filter(minute =>
    templates.some(template => template.windows.some(window => inWindow(minute, window)))).length;
  if (inside < generated * TIMETABLE_REPEAT_MIN_SHARE) return repeated;
  for (const template of templates) {
    for (const window of template.windows) {
      if (scheduledStartMinutes.some(minute => inWindow(minute, window))) repeated.add(window);
    }
  }
  return repeated;
}

const CHAINED_TRIP_MAX_LAYOVER_MIN = 10;

/**
 * Stop times where a bus ends one trip and the same block continues from that stop on the next
 * trip of the same service, route and direction within 10 minutes (#341). Keyed
 * trip|stop|stop_sequence of the ending trip's last stop; the value says whether the continuing
 * trip keeps the headsign. Trips without a block_id, hand-overs between different blocks, and
 * layovers over 10 minutes are not chained.
 */
export function findChainedTripEnds(
  trips: ReadonlyArray<{ trip_id: string; route_id: string; service_id: string; block_id?: string; direction_id?: string; trip_headsign?: string }>,
  stopTimesByTripId: ReadonlyMap<string, ReadonlyArray<{ stop_id: string; stop_sequence: string | number; arrival_time?: string; departure_time?: string }> | undefined>,
  firstDepartureByTripId: ReadonlyMap<string, number>,
): Map<string, boolean> {
  const chained = new Map<string, boolean>();
  const tripsByBlock = new Map<string, Array<(typeof trips)[number]>>();
  for (const trip of trips) {
    const block = trip.block_id?.trim();
    if (!block || !firstDepartureByTripId.has(trip.trip_id)) continue;
    const key = `${block}::${trip.service_id}`;
    const list = tripsByBlock.get(key) ?? [];
    list.push(trip);
    tripsByBlock.set(key, list);
  }
  const endpoints = (tripId: string) => {
    const ordered = [...(stopTimesByTripId.get(tripId) ?? [])]
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    return { first: ordered[0], last: ordered[ordered.length - 1] };
  };
  for (const list of tripsByBlock.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => firstDepartureByTripId.get(a.trip_id)! - firstDepartureByTripId.get(b.trip_id)!);
    for (let i = 0; i + 1 < list.length; i++) {
      const ending = list[i], next = list[i + 1];
      if (ending.route_id !== next.route_id || (ending.direction_id ?? '') !== (next.direction_id ?? '')) continue;
      const a = endpoints(ending.trip_id).last, b = endpoints(next.trip_id).first;
      if (!a || !b || a.stop_id !== b.stop_id) continue;
      const arrive = t2m(a.arrival_time || a.departure_time || ''), leave = t2m(b.departure_time || b.arrival_time || '');
      if (arrive === null || leave === null || leave < arrive || leave - arrive > CHAINED_TRIP_MAX_LAYOVER_MIN) continue;
      chained.set(`${ending.trip_id}|${a.stop_id}|${a.stop_sequence}`,
        (ending.trip_headsign ?? '').trim() === (next.trip_headsign ?? '').trim());
    }
  }
  return chained;
}

/**
 * A trip's stop_times in stop_sequence order, keeping only its first visit to
 * each stop. Loop and out-and-back trips pass the same stop twice; counting both
 * visits interleaves two departures per trip and halves the headway (#712,
 * same rule as the stop_times pass, AI-121).
 */
// Sorted by stop_sequence here, while the stop_times pass walks file order.
// GTFS does not require stop_times.txt to be sorted, so stop_sequence is the
// correct order; the stop_times pass is shared by every agency and is left as
// it is (feeds in practice write each trip in sequence order, so the two agree).
export function firstVisitStopTimes<T extends { stop_id: string; stop_sequence?: string | number }>(tripStops: readonly T[]): T[] {
  const ordered = [...tripStops].sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const st of ordered) {
    if (seen.has(st.stop_id)) continue;
    seen.add(st.stop_id);
    out.push(st);
  }
  return out;
}

/**
 * Use all departures for the feature's destination at its terminal stop.
 * Different shapes can add or omit an intermediate stop while still providing
 * the same terminal service; using only one shape creates false gaps there.
 */
export function selectTerminalDepartureTimes(
  shapeTimes: number[] | undefined,
  headsignTimes: number[] | undefined,
): number[] | undefined {
  return headsignTimes ?? shapeTimes;
}

/**
 * Headline and tier read from a branch-scoped terminal sample (the headsign's departures at the
 * terminal) for a feature drawn on a thin shape that won feature dedupe. Null unless the sample
 * has daytime service of its own (midday or PM peak), so a night route's early-morning trips never
 * become its headline (ttc 329 and 334 Sunday). The headline is the sustained 6-22h median; the
 * tier runs phase 2's own tier rule on the sample's day window. Phase 2 graded only the thin
 * shape's trips (capmetro 2: four trips per shape, an 80-minute hole, "infrequent" under a
 * 16-minute headline). The tier is null for rail, which phase 2 grades on a midday window.
 */
/** The Step 1 headline window (midday, then PM peak, then a sustained 6-22h value) read as the
 * typical wait on the headsign's pooled departures at the terminal, or null (#772). */
function pooledTerminalHeadway(times: readonly number[] | undefined): number | null {
  if (!times || times.length === 0) return null;
  const sorted = [...times].sort((a, b) => a - b);
  return medianHeadwayInWindow(sorted, 540, 900, 3, true)
    ?? medianHeadwayInWindow(sorted, 900, 1140, 3, true)
    ?? sustainedMedianHeadwayInWindow(sorted, 360, 1320, 3, undefined, true);
}

export function scopedTerminalHeadline(
  times: readonly number[] | undefined,
  day: DayType,
  routeType: string,
  railLike: boolean,
): { headway: number; tier: string | null } | null {
  // Unique times: phase 1 drops duplicate departures, and a zero-minute gap would loosen the
  // every-gap allowance (wsf 73 Bainbridge: 161 trips, 23 distinct times).
  const sorted = [...new Set(times ?? [])].sort((a, b) => a - b);
  const hasDaytime = (medianHeadwayInWindow(sorted, 540, 900, 3)
    ?? medianHeadwayInWindow(sorted, 900, 1140, 3)) != null;
  if (!hasDaytime) return null;
  // The sample must be all-day service, not a burst of its own (cta 82 Homan & Congress: three
  // PM short turns minutes apart would read 8): at least four departures over 6-22h, spread
  // over more than phase 2's burst span.
  const daytime = sorted.filter(t => t >= 360 && t <= 1320);
  if (new Set(daytime).size < MIN_ALL_DAY_TERMINAL_DEPARTURES
    || daytime[daytime.length - 1] - daytime[0] <= BURST_MAX_SPAN_MINUTES) return null;
  const headway = sustainedMedianHeadwayInWindow(sorted, 360, 1320, 3, undefined, true);
  if (headway == null) return null;
  const dayConfig = DEFAULT_CRITERIA.dayTypes[day];
  if (railLike || !dayConfig) return { headway, tier: null };
  const { start, end } = dayConfig.timeWindow;
  const windowed = sorted.filter(t => t >= start && t <= end);
  if (windowed.length < 3) return { headway, tier: null };
  const gaps = windowed.slice(1).map((t, i) => t - windowed[i]);
  const determined = determineTierWithEdgeGapAllowance(
    gaps,
    windowed.length,
    windowed[windowed.length - 1] - windowed[0],
    getTiersForCriteria(routeType, dayConfig.tiers, DEFAULT_CRITERIA.modeTierOverrides),
    DEFAULT_CRITERIA.graceMinutes,
    DEFAULT_CRITERIA.maxGraceViolations,
    DEFAULT_CRITERIA.gracePercent,
    DEFAULT_CRITERIA.violationPercent,
    {
      rawDepartureTimes: sorted,
      analysisTimes: windowed,
      day: (day === 'Weekday' ? 'Wednesday' : day) as DayName,
      routeType,
      railLike,
    },
    DEFAULT_CRITERIA.violationPercentByTier,
  );
  return { headway, tier: determined === 'span' ? 'infrequent' : determined };
}

export { selectPeriodCoverageHeadway } from './routeGrading.js';

/** Evaluate route-level Night Service from either end of a shape. */
export function hasNightServiceAtShapeEndpoints(
  endpointStopIds: readonly (string | undefined)[],
  routeDepartures: ReadonlyMap<string, number[]>,
  overnightOnlyDepartures: ReadonlyMap<string, number[]> = new Map(),
  maxGapMinutes: number = 60,
): boolean {
  return [...new Set(endpointStopIds.filter((id): id is string => id != null))].some(stopId => {
    const departures = routeDepartures.get(stopId);
    if (!departures) return false;
    return hasSustainedNightService(
      nightServiceDepartureTimes(departures, overnightOnlyDepartures.get(stopId) ?? []),
      undefined,
      undefined,
      maxGapMinutes,
    );
  });
}

const PERIODS = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }]),
) as Record<string, { start: number; end: number }>;

export interface ProcessOptions extends GtfsTransformOptions {
  slug?: string;
  manualBaseFare?: number;
  /**
   * When true, continue after GTFS validation errors (log only).
   * Default false: throw GtfsValidationError so process CLI fails closed.
   * Refresh catches the error and soft-skips the agency.
   */
  force?: boolean;
  /**
   * Analysis-only override used by local comparison audits. Production callers
   * omit this and continue to use the default analysis criteria.
   */
  analysisCriteriaFn?: (raw: RawRouteDepartures[]) => AnalysisResult[];
  /** Read-only view of the phase 2 results, for tests and audits. Does not change the output. */
  onAnalysisResults?: (results: readonly AnalysisResult[]) => void;
}

/** Thrown when validateGtfs reports errors and options.force is not set. */
export class GtfsValidationError extends Error {
  readonly report: ValidationReport;
  constructor(report: ValidationReport) {
    super(`GTFS validation failed with ${report.errors} error(s)`);
    this.name = 'GtfsValidationError';
    this.report = report;
  }
}


export interface ProcessResult {
  geojson: string;
  corridorsGeojson: string; // isCorridor features only, served separately
  stopsJson: string; // JSON: Record<stopId, StopEntry> — for Corridors stop search
  tripsJson: string; // JSON: Record<tripId, {d: directionId, h: headsign|null}> for live vehicle enrichment
  stopsMetaJson: string; // JSON: StopsMetaFile — per-stop facts (routes, direction) for external consumers
  featureCount: number;
  center: [number, number] | null;
  timezone: string | null;     // agency_timezone from agency.txt (IANA name, e.g. "America/Toronto"), or null if absent
  feedExpiry: string | null;   // feed_end_date from feed_info.txt, or null if absent
  /** Latest service date across feed_info, calendar.txt and added calendar_dates; uncapped. Feed with `feedExpiry` through recordedFeedExpiry() to get the value to store. */
  calendarExpiry: string | null;
  feedVersion: string | null;  // feed_version from feed_info.txt, or null if absent
  livePollingSidecar?: Record<string, any>;
  shapeAnomalies?: import('../types/gtfs.js').ShapeAnomaly[];
  feedQuality: FeedQuality;
}

/**
 * Stop order for a route with no usable shape: the stop_sequence order of the candidate trip that
 * serves the most known stops. Rows are sorted by numeric stop_sequence (file order is not
 * meaningful), unknown stops are dropped, and a stop revisited by a loop is kept at its first visit.
 */
export function representativeStopSequence(
  candidateTrips: ReadonlyArray<{ trip_id: string }>,
  stopTimesByTripId: ReadonlyMap<string, ReadonlyArray<{ stop_id: string; stop_sequence: string | number }> | undefined>,
  hasStop: (stopId: string) => boolean,
): string[] {
  let best: string[] = [];
  for (const trip of candidateTrips) {
    const tripStops = stopTimesByTripId.get(trip.trip_id) ?? [];
    if (tripStops.length <= best.length) continue;
    const sequence: string[] = [];
    const seen = new Set<string>();
    for (const stopTime of [...tripStops].sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))) {
      if (!hasStop(stopTime.stop_id) || seen.has(stopTime.stop_id)) continue;
      seen.add(stopTime.stop_id);
      sequence.push(stopTime.stop_id);
    }
    if (sequence.length > best.length) best = sequence;
  }
  return best;
}

/**
 * Grouping key for a GTFS route (shared routeGroupKey): its short name, or `id:<route_id>` when
 * the short name is missing, empty or whitespace-only (#717). Keys only -- displayed names keep
 * the raw short name, so a feed with no short names (clemson-cat, coast-rta) never shows ids.
 */
export function routeGroupName(route: { route_short_name?: string | null } | undefined, routeId: string): string {
  return routeGroupKey(route?.route_short_name, routeId);
}

/**
 * Number of weekdays (Mon-Fri) on which each route_id::direction has scheduled service, counted
 * across ALL of its trips, shapes and patterns (#710). A weekday counts when the direction has
 * at least two departures that day (phase 1 drops a day with fewer), from services active that
 * weekday at the reference date, or from a service whose calendar.txt row omits the weekday but
 * which calendar_dates.txt adds on that weekday at least three times within 6 weeks of the
 * reference date (and inside its calendar.txt range) (Seattle Streetcar 128666: calendar Tue+Wed, added every Mon/Thu/Fri), or
 * from a calendar.txt service whose regular weekly pattern includes the weekday (see below).
 * getActiveServiceIds does not read those additions for calendar.txt services, so without this
 * a route that runs every weekday looked like a Tue+Wed route.
 */
export function weekdayServiceDaysByRouteDir(
  gtfs: Pick<GtfsData, 'trips' | 'frequencies' | 'calendar' | 'calendarDates' | 'synthesizedDirectionRouteIds'>,
  referenceDate: string,
  activeServiceIdsByDay: ReadonlyMap<DayName, ReadonlySet<string>>,
  // Additions count only within 6 weeks of the reference date and, for a calendar.txt service,
  // inside its own date range: an addition from another season, or a few special-event dates,
  // must not make a part-week route look like full-week service (it would then show the days
  // it does run as "Weekday").
  additionRule: { windowDays: number; withinCalendarRange: boolean } = { windowDays: 42, withinCalendarRange: true },
  // route_id::dir::DayName days whose only service is the previous night's after-midnight tail
  // (previousNightTailDays, #718). They are another night's service, not that weekday's: a
  // Mon+Tue night route with 00:00-form tails must not count Wednesday as a service day.
  previousNightTails: ReadonlySet<string> = new Set(),
): Map<string, number> {
  const ymd = (date: string) => new Date(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
  const reference = ymd(referenceDate).getTime();
  const DAY = 86400000;
  // Regular weekly pattern: a calendar.txt service whose range covers the reference date
  // runs on its flagged weekdays unless calendar_dates removes most of those dates (within
  // 90 days). A short suspension in the reference week (GCRTA Blue Line, Oct 2026: the
  // regular Mon-Fri service removed for two weeks) does not make the route a part-week route.
  const removed = new Set<string>();
  for (const cd of gtfs.calendarDates ?? []) if (cd.exception_type === '2') removed.add(`${cd.service_id}|${cd.date}`);
  const regular = new Map<string, boolean[]>();
  const WEEKDAY_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
  for (const cal of gtfs.calendar ?? []) {
    if (cal.start_date > referenceDate || cal.end_date < referenceDate) continue;
    const from = Math.max(ymd(cal.start_date).getTime(), reference - 90 * DAY);
    const to = Math.min(ymd(cal.end_date).getTime(), reference + 90 * DAY);
    const flags = WEEKDAY_FIELDS.map((field, index) => {
      if (cal[field] !== '1') return false;
      let total = 0;
      let kept = 0;
      for (let t = from; t <= to; t += DAY) {
        const date = new Date(t);
        if (date.getDay() !== index + 1) continue;
        total += 1;
        const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        if (!removed.has(`${cal.service_id}|${key}`)) kept += 1;
      }
      return total > 0 && kept * 2 > total;
    });
    regular.set(cal.service_id, flags);
  }
  const additions = new Map<string, number[]>();
  const calendarRange = new Map((gtfs.calendar ?? []).map(cal => [cal.service_id, [cal.start_date, cal.end_date] as const]));
  for (const cd of gtfs.calendarDates ?? []) {
    if (cd.exception_type !== '1') continue;
    const date = ymd(cd.date);
    if (Math.abs(date.getTime() - reference) / DAY > additionRule.windowDays) continue;
    const range = additionRule.withinCalendarRange ? calendarRange.get(cd.service_id) : undefined;
    if (range && (cd.date < range[0] || cd.date > range[1])) continue;
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const counts = additions.get(cd.service_id) ?? [0, 0, 0, 0, 0];
    counts[dow - 1] += 1;
    additions.set(cd.service_id, counts);
  }
  const departuresByTrip = new Map<string, number>();
  for (const frequency of gtfs.frequencies ?? []) {
    const start = t2m(frequency.start_time);
    const end = t2m(frequency.end_time);
    const headway = Number(frequency.headway_secs) / 60;
    if (start === null || end === null || !Number.isFinite(headway) || headway < 1 || end <= start) continue;
    departuresByTrip.set(frequency.trip_id, (departuresByTrip.get(frequency.trip_id) ?? 0) + Math.ceil((end - start) / headway));
  }
  const departures = new Map<string, number[]>();
  for (const trip of gtfs.trips ?? []) {
    const added = additions.get(trip.service_id);
    const key = `${trip.route_id}::${trip.direction_id?.trim() || '0'}`;
    WEEKDAYS.forEach((day, index) => {
      if (!activeServiceIdsByDay.get(day)?.has(trip.service_id)
        && !((added?.[index] ?? 0) >= 3)
        && !regular.get(trip.service_id)?.[index]) return;
      if (previousNightTails.has(`${key}::${day}`)) return;
      const counts = departures.get(key) ?? [0, 0, 0, 0, 0];
      counts[index] += departuresByTrip.get(trip.trip_id) ?? 1;
      departures.set(key, counts);
    });
  }
  const days = new Map([...departures].map(([key, counts]) => [key, counts.filter(count => count >= 2).length]));
  // A synthesized direction is a guess from shapes, not the feed's direction: Kalamazoo gives
  // Mon-Thu and Friday trips their own shapes, and the guess put a Friday-only shape in
  // "direction 1" of a route that runs both ways every weekday. Decide those routes as a whole.
  const synthesized = gtfs.synthesizedDirectionRouteIds;
  if (synthesized && synthesized.size > 0) {
    const routeCounts = new Map<string, number[]>();
    for (const [key, counts] of departures) {
      const routeId = key.slice(0, key.lastIndexOf('::'));
      if (!synthesized.has(routeId)) continue;
      const sum = routeCounts.get(routeId) ?? [0, 0, 0, 0, 0];
      counts.forEach((count, index) => { sum[index] += count; });
      routeCounts.set(routeId, sum);
    }
    for (const key of days.keys()) {
      const routeId = key.slice(0, key.lastIndexOf('::'));
      const sum = routeCounts.get(routeId);
      if (sum) days.set(key, sum.filter(count => count >= 2).length);
    }
  }
  return days;
}

/** Local run date as YYYYMMDD. */
function runDateYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
export { MIN_THIN_REPLACING_DEPARTURES } from './featureDedupe.js';

/** #728: the destination pool at a line's terminal must have this many unique departures (and more than the drawn shape) before its every-gap grade can lift the line's tier. */
export const MIN_POOLED_TIER_DEPARTURES = 8;

export async function processGtfsBuffer(
  buf: Buffer,
  onStatus?: (msg: string) => void,
  options?: ProcessOptions,
): Promise<ProcessResult> {
  let gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, onStatus, { keepLongShapeJumps: options?.keepLongShapeJumps, skipClusteredJumpRepair: options?.skipClusteredJumpRepair });
  gtfs = normalizeGtfs(gtfs, options, onStatus);

  const validation = validateGtfs(gtfs, options?.slug ?? 'feed');
  if (validation.errors > 0) {
    const errorIssues = validation.issues.filter(i => i.severity === 'error');
    onStatus?.(`Validation: ${validation.errors} error(s), ${validation.warnings} warning(s)`);
    for (const issue of errorIssues.slice(0, 12)) {
      onStatus?.(`  [${issue.code}] ${issue.file}: ${issue.message}`);
    }
    if (!options?.force) {
      throw new GtfsValidationError(validation);
    }
    onStatus?.('  continuing despite validation errors (--force)');
  } else if (validation.warnings > 0) {
    onStatus?.(`Validation: ${validation.warnings} warning(s)`);
  }

  const routeBaseFares = computeRouteBaseFares(gtfs, options?.manualBaseFare);

  const routeById = new Map((gtfs.routes ?? []).map(r => [r.route_id, r]));

  const stopsById = new Map<string, { lat: number; lon: number }>();
  for (const stop of gtfs.stops ?? []) {
    const lat = parseFloat(stop.stop_lat);
    const lon = parseFloat(stop.stop_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      stopsById.set(stop.stop_id, { lat, lon });
    }
  }

  // Agency opt-in: read the feed as of the run date. NCSU Wolfline (Passio) gives every
  // service a 2025-2027 calendar.txt period and switches semester and summer timetables only
  // with calendar_dates removals, so the period midpoint (Jul 2, 2026) always read the summer
  // timetable and dropped the semester-only routes 40 and 51 (#774).
  const refDate = options?.referenceDateFromRunDate
    ? runDateYmd()
    : detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates, gtfs.trips);
  // Union all 7 days, not just Monday/Saturday/Sunday — an agency whose weekday
  // service runs e.g. Tuesday-Friday only (no Monday service at all) had every
  // one of its route::dir keys silently excluded from shape selection, dropping
  // otherwise-valid phase1/phase2 results with `if (!shapeId) continue` further
  // down (Fredericksburg Regional Transit pattern).
  const activeServiceIdsByCalendarDay = new Map<DayName, Set<string>>(
    ALL_DAYS.map(day => [day, getActiveServiceIds(gtfs.calendar ?? [], gtfs.calendarDates ?? [], day, refDate)]),
  );
  const activeServiceIdsByDay = new Map<DayType, Set<string>>();
  const calendarDaysForType = (dayType: DayType): DayName[] =>
    dayType === 'Weekday' ? [...WEEKDAYS] : [dayType as DayName];
  for (const dayType of DAY_TYPES) {
    activeServiceIdsByDay.set(
      dayType,
      // Spread each Set: flatMap only flattens arrays, so returning the Set itself
      // stored Set objects instead of service ids and emptied all stop data.
      new Set(calendarDaysForType(dayType).flatMap(day => [...activeServiceIdsByCalendarDay.get(day)!])),
    );
  }
  const activeForShapes = new Set<string>(ALL_DAYS.flatMap(day => [...activeServiceIdsByCalendarDay.get(day)!]));
  const shapes = buildShapeSelectionContext(gtfs, routeById, activeForShapes, activeServiceIdsByDay, options?.slug);
  const {
    shapeById,
    shapeCounts,
    headsignDisplayShape,
    headsignDisplayShapeByDay,
    routeDirToHeadsign,
    routeDirToDisplayShape,
    routeDirToAnalysisShapes,
    shapeFilterForPhase1,
    lastStopByTrip,
    stopNameById,
  } = shapes;

  onStatus?.('Running phase 1...');
  const raw = computeRawDepartures(gtfs, refDate, shapeFilterForPhase1, options?.slug);
  onStatus?.('Running phase 2...');
  // Same tail days phase 2 uses (#718), so the part-week decision (phase 2) and the stop-level
  // full-week check below both skip a weekday that only carries the previous night's tail.
  const weekdayServiceDays = weekdayServiceDaysByRouteDir(gtfs, refDate, activeServiceIdsByCalendarDay, undefined, previousNightTailDays(raw));
  // A burst or stray-trip pattern is demoted to irregular only when other regular shapes already
  // draw its road (#732). Unknown geometry counts as not covered, so nothing is hidden blindly.
  const isShapeCovered = makeShapeCoverChecker(shapeById);
  const analyze = options?.analysisCriteriaFn
    ?? ((input: RawRouteDepartures[]) => applyAnalysisCriteria(input, undefined, undefined, weekdayServiceDays, isShapeCovered));
  const analyzed = analyze(raw);
  options?.onAnalysisResults?.(analyzed);
  const results = analyzed.map(result =>
    options?.slug === 'niagara' ? normalizeNrtAnalysisResult(result) : result,
  );

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

  // Per-stop headway computation (AI-96): map serviceId → dayTypes, then tripId → groups,
  // so each service block contributes to every applicable weekday/weekend bucket.
  const serviceIdToDayTypes = new Map<string, Set<DayType>>();
  for (const dayType of DAY_TYPES) {
    for (const id of activeServiceIdsByDay.get(dayType) ?? []) {
      const types = serviceIdToDayTypes.get(id) ?? new Set<DayType>();
      types.add(dayType);
      serviceIdToDayTypes.set(id, types);
    }
  }
  // The Weekday stop maps (route/direction group, headsign and shape) each describe ONE
  // representative weekday, picked per map by the same median-count rule phase 2 uses for
  // each route-level Weekday rollup subgroup (#710). Pooling every service that runs on any
  // of Mon-Fri interleaved timetables that never run on the same day (cata-state-college
  // White Loop: Mon-Thu and Friday every 5-6 min shown as every 3) and let a service from
  // only some weekdays set the weekday value. Only days with service are candidates, so a
  // feed with no Monday service (Tue-Fri) still has weekday stop data, and a Monday holiday
  // is already swapped for a typical week by getActiveServiceIds (#658).
  type StopTripGroup = {
    routeId: string; shortName: string; dirId: string; dayType: DayType; headsign: string | null;
    shapeId: string | null; serviceId: string; routeVariant: string | null;
    // Whether this trip's departures go into the group, headsign and shape maps. Always
    // true outside Weekday; for Weekday, true only when the trip runs on that map's day.
    inGroup: boolean; inHeadsign: boolean; inShape: boolean;
  };
  const stopTripMeta = new Map<string, { shortName: string; dirId: string; headsign: string | null; shapeId: string | null }>();
  for (const trip of gtfs.trips ?? []) {
    if (!serviceIdToDayTypes.has(trip.service_id)) continue;
    // Use shortName as the group key so agencies with multiple route_ids per line (e.g. GO Transit
    // date-prefixed IDs like 04260626-LW / 06260926-LW) merge into one combined stop frequency group.
    const route = routeById.get(trip.route_id);
    const shortName = route?.route_short_name ?? trip.route_id;
    // An empty short name must not become one agency-wide stop group (#717).
    const groupName = routeGroupName(route, trip.route_id);
    const longName = route?.route_long_name?.trim() ?? null;
    let rawHeadsign = trip.trip_headsign?.trim() || null;
    if (!rawHeadsign) {
      const lastStopId = lastStopByTrip.get(trip.trip_id);
      if (lastStopId) rawHeadsign = stopNameById.get(lastStopId) ?? null;
    }
    const headsign = resolveDisplayHeadsign(rawHeadsign, shortName, longName);
    stopTripMeta.set(trip.trip_id, { shortName: groupName, dirId: String(trip.direction_id ?? '0'), headsign, shapeId: trip.shape_id || null });
  }
  const frequencyDepartureCount = frequencyDepartureCounts(gtfs.frequencies, gtfs.stopTimes);
  // Stop maps are keyed by short name + direction (plus headsign and shape), while phase 2
  // groups by route_id + direction + headsign + shape. That difference is deliberate: stop
  // maps merge route_ids that share a short name (GO date-prefixed ids), and each map picks
  // its own day so a feature whose display shape runs on fewer days keeps its own shape
  // data instead of falling back to another pattern's (cata-state-college VE Campus).
  const weekdayMapKeys = (meta: { shortName: string; dirId: string; headsign: string | null; shapeId: string | null }) => ({
    group: `${meta.shortName}::${meta.dirId}`,
    headsign: meta.headsign ? `${meta.shortName}::${meta.dirId}::${meta.headsign}` : null,
    shape: meta.shapeId,
  });
  // Departures per weekday for every Weekday map key, frequencies.txt windows expanded.
  const weekdayCounts = { group: new Map<string, number[]>(), headsign: new Map<string, number[]>(), shape: new Map<string, number[]>() };
  // Map keys fed by at least one route direction that runs on 3+ weekdays (not partial).
  const servesFullWeek = { group: new Set<string>(), headsign: new Set<string>(), shape: new Set<string>() };
  for (const trip of gtfs.trips ?? []) {
    const meta = stopTripMeta.get(trip.trip_id);
    if (!meta || !serviceIdToDayTypes.get(trip.service_id)!.has('Weekday')) continue;
    const departures = frequencyDepartureCount.get(trip.trip_id) ?? 1;
    const keys = weekdayMapKeys(meta);
    const fullWeek = (weekdayServiceDays.get(`${trip.route_id}::${trip.direction_id?.trim() || '0'}`) ?? 0) >= 3;
    for (const kind of ['group', 'headsign', 'shape'] as const) {
      const key = keys[kind];
      if (key == null) continue;
      if (fullWeek) servesFullWeek[kind].add(key);
      const counts = weekdayCounts[kind].get(key) ?? WEEKDAYS.map(() => 0);
      WEEKDAYS.forEach((day, index) => {
        if (activeServiceIdsByCalendarDay.get(day)!.has(trip.service_id)) counts[index] += departures;
      });
      weekdayCounts[kind].set(key, counts);
    }
  }
  const representativeWeekday = { group: new Map<string, DayName>(), headsign: new Map<string, DayName>(), shape: new Map<string, DayName>() };
  for (const kind of ['group', 'headsign', 'shape'] as const) {
    for (const [key, counts] of weekdayCounts[kind]) {
      // Shared with the running time (CIV-84); see pickRepresentativeWeekday for the rule.
      const index = pickRepresentativeWeekday(counts, servesFullWeek[kind].has(key));
      if (index === null) continue;
      representativeWeekday[kind].set(key, WEEKDAYS[index]);
    }
  }
  const tripGroupByTripId = new Map<string, StopTripGroup[]>();
  for (const trip of gtfs.trips ?? []) {
    const meta = stopTripMeta.get(trip.trip_id);
    if (!meta) continue;
    const keys = weekdayMapKeys(meta);
    const runsOnRepresentativeDay = (kind: 'group' | 'headsign' | 'shape'): boolean => {
      const key = keys[kind];
      const day = key == null ? undefined : representativeWeekday[kind].get(key);
      return day != null && activeServiceIdsByCalendarDay.get(day)!.has(trip.service_id);
    };
    tripGroupByTripId.set(trip.trip_id, [...serviceIdToDayTypes.get(trip.service_id)!].map(dayType => ({
        routeId: trip.route_id,
        ...meta,
        dayType,
        serviceId: trip.service_id,
        routeVariant: trip.route_variant?.trim() || null,
        inGroup: dayType !== 'Weekday' || runsOnRepresentativeDay('group'),
        inHeadsign: dayType !== 'Weekday' || runsOnRepresentativeDay('headsign'),
        inShape: dayType !== 'Weekday' || runsOnRepresentativeDay('shape'),
    })));
  }
  // Max raw stop_time minute seen anywhere for each service_id. Needed below: a service_id
  // qualifies as a genuine overnight-only block (#297; e.g. CTA Red Line's 00:10-02:45 under
  // its own dedicated service_id, day-type-pooled at the wrong end of the array, invisible to
  // hasSustainedNightService's [1560,1800] window) only if its OWN entire trip set sits below
  // the early-morning cutoff -- NOT merely "has no extended trips". A service_id whose early
  // trip is just that day's own normal start (e.g. CTA's daytime service_id, first trip 03:00,
  // last trip 23:52 -- no extended notation either, but clearly not overnight-only) must NOT
  // qualify, or its early trip gets nonsensically duplicated as a "next night" departure.
  // Verified against MiWay and NYCT Subway too: both have exactly one Monday-active service_id
  // covering the whole day, so neither qualifies -- their apparent tail-end gap (last trip to
  // 6am) has no other Monday service_id to borrow from, meaning the gap is genuinely absent
  // from the feed, not stranded elsewhere. Shifting would fabricate departures, not recover them.
  const serviceIdMaxMinute = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    const tripGroups = tripGroupByTripId.get(st.trip_id);
    if (!tripGroups || tripGroups.length === 0) continue;
    const timeStr = st.departure_time || st.arrival_time;
    if (!timeStr) continue;
    const mins = t2m(timeStr);
    if (mins === null) continue;
    const serviceId = tripGroups[0].serviceId;
    const prev = serviceIdMaxMinute.get(serviceId);
    if (prev === undefined || mins > prev) serviceIdMaxMinute.set(serviceId, mins);
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
  // Night-service-only mirrors of stopDepsByGroup/stopDepsByHeadsignGroup (#297): an early
  // (pre-6am) departure on a genuinely overnight-only service_id (see serviceIdMaxMinute above)
  // is shifted +1440 and pushed here instead, so it lands inside hasSustainedNightService's
  // [1560,1800] window without altering the times every other consumer (headway, tier,
  // sparkline, ...) reads from stopDepsByGroup/stopDepsByHeadsignGroup. Deliberately no
  // shape-scoped mirror -- the Step 5 terminalRawTimes fallback bottoms out at stopDepsByGroup
  // regardless, so this still covers every route that reaches the night-service check.
  const stopDepsByGroupNight = new Map<string, Map<string, number[]>>();
  const stopDepsByHeadsignGroupNight = new Map<string, Map<string, number[]>>();
  // Shared-stretch pooling (CIV-82): each pattern's departures inside its route group,
  // direction and day, all on the GROUP's representative weekday (inGroup), so patterns
  // pooled at a shared stop never mix two different weekdays. Keyed by shape for buses and
  // by headsign for rail, the same scope as each feature's own stop metrics. Read only by
  // annotateSharedStretches; no existing value uses it.
  const stopDepsBySharedMember = new Map<string, Map<string, number[]>>();
  const railRouteIds = new Set((gtfs.routes ?? []).filter(route => isRailLikeRoute({
    routeType: route.route_type,
    routeLongName: route.route_long_name,
    routeShortName: route.route_short_name,
  })).map(route => route.route_id));
  // A pattern: route_id + shape for buses (every trip on the feature's own shape, as in its
  // shape-scoped stop metrics), route_id + headsign for rail (headsign-scoped metrics).
  const sharedPatternKey = (routeId: string, headsign: string | null, shapeId: string | null | undefined): string | null => {
    if (railRouteIds.has(routeId)) return `${routeId}|hs|${headsign ?? ''}`;
    return shapeId ? `${routeId}|sh|${shapeId}` : null;
  };
  // Trips pool only under a headsign that an eligible feature draws (regular or time-limited,
  // not span, partial-weekday or drop-off-only): `${shortName}::${dir}::${day}::${routeId}::${headsign}`.
  // Filled from the built features before the stop_times pass reads it.
  const sharedEligibleHeadsigns = new Set<string>();
  const sharedMemberKey = (grp: { routeId: string; shortName: string; dirId: string; dayType: string; headsign: string | null; shapeId: string | null }): string | null => {
    if (!sharedEligibleHeadsigns.has(`${grp.shortName}::${grp.dirId}::${grp.dayType}::${grp.routeId}::${grp.headsign ?? ''}`)) return null;
    const member = sharedPatternKey(grp.routeId, grp.headsign, grp.shapeId);
    return member ? `${grp.shortName}::${grp.dirId}::${grp.dayType}::${member}` : null;
  };

  // A frequency-based trip has one representative stop-time sequence, while
  // frequencies.txt describes the repeated departures. Add those generated
  // departures to stop-level metrics after the ordinary stop_times pass below.
  const firstDepartureByTripId = new Map<string, number>();
  const lastDepartureByTripId = new Map<string, number>();
  const stopTimesByTripId = new Map<string, typeof gtfs.stopTimes>();
  for (const st of gtfs.stopTimes ?? []) {
    const mins = t2m(st.departure_time || st.arrival_time);
    if (mins !== null) {
      const previous = firstDepartureByTripId.get(st.trip_id);
      if (previous === undefined || mins < previous) firstDepartureByTripId.set(st.trip_id, mins);
      const previousLast = lastDepartureByTripId.get(st.trip_id);
      if (previousLast === undefined || mins > previousLast) lastDepartureByTripId.set(st.trip_id, mins);
    }
    const tripStops = stopTimesByTripId.get(st.trip_id) ?? [];
    tripStops.push(st);
    stopTimesByTripId.set(st.trip_id, tripStops);
  }
  // A bus that ends one trip at a stop and leaves it again on the next trip of the same block,
  // route and direction is one vehicle passing, not two: TTC splits each 47 Lansdowne run at
  // Lansdowne Station (arrive 10:52, depart 10:54 on the next trip), so that stop counted every
  // bus twice and read every 2 min against the route's 7 (#341). The ending trip's arrival there
  // is left out of the pooled stop departures (route group, headsign when the next trip keeps
  // it, shared stretch), where the continuing trip's departure is also counted. The shape's own
  // map keeps it, so the ending trip's terminal stays in its stop list.
  const chainedTripEnds = findChainedTripEnds(gtfs.trips ?? [], stopTimesByTripId, firstDepartureByTripId);
  // Routes whose feed has no usable shape are published as a Point with noRouteShape. Their stop
  // order comes from one representative trip's stop_sequence (the matching trip that serves the
  // most stops), not from the order stops happen to appear in stop_times.txt.
  const tripsByRouteDir = new Map<string, NonNullable<typeof gtfs.trips>>();
  for (const trip of gtfs.trips ?? []) {
    const key = `${trip.route_id}::${String(trip.direction_id ?? '0')}`;
    const list = tripsByRouteDir.get(key) ?? [];
    list.push(trip);
    tripsByRouteDir.set(key, list);
  }
  const maplessStopSequenceForResult = (result: AnalysisResult): string[] => {
    const serviceIds = new Set(result.serviceIds ?? []);
    const route = routeById.get(result.route);
    const shortName = route?.route_short_name ?? result.route;
    const longName = route?.route_long_name?.trim() ?? null;
    const wantedHeadsign = result.headsign ? resolveDisplayHeadsign(result.headsign, shortName, longName) : null;
    const candidates = (tripsByRouteDir.get(`${result.route}::${String(result.dir)}`) ?? []).filter(candidate => {
      if (serviceIds.size > 0 && !serviceIds.has(candidate.service_id)) return false;
      if (wantedHeadsign == null) return true;
      const rawHeadsign = candidate.trip_headsign?.trim() || null;
      return resolveDisplayHeadsign(rawHeadsign, shortName, longName) === wantedHeadsign;
    });
    return representativeStopSequence(candidates, stopTimesByTripId, stopId => stopsById.has(stopId));
  };
  const maplessStopSequence = new Map<GeoJsonFeature, string[]>();
  // Track first visit per (trip_id, stop_id) to avoid double-counting loop routes
  // where the terminus appears at both the start and end of the same trip.
  const stopFirstVisit = new Map<string, Set<string>>();

  // Build route features; deduplicate by (routeShortName, directionId, day) so feeds with
  // multiple schedule-period route IDs (e.g. GO Transit 04260626-LW / 06260926-LW) don't
  // emit two overlapping features per line. When duplicates exist, keep the lower headway
  // (more frequent / more trips active in the analysis window).
  const dedupedFeatures = new Map<string, GeoJsonFeature>();
  // What dedupe knows about the pattern holding each slot (featureDedupe.ts).
  const dedupedPattern = new Map<string, DedupePattern>();
  // Feature → the shapeId it was actually built from, so the per-stop headway
  // resolution loop below can pool departures scoped to that exact physical path.
  const featureShapeId = new Map<GeoJsonFeature, string>();
  // Feature → its stop-map group name (routeGroupName), which differs from the displayed
  // routeShortName when the feed's short name is empty (#717).
  const featureGroupName = new Map<GeoJsonFeature, string>();
  // Feature → how many departures backed its own (branch-level) headway, so Step 4 below can
  // tell a real branch frequency from a noisy one before trusting it over the terminal-computed
  // value. Not serialized to the GeoJSON output — pipeline-internal only. See issue #263.
  // Weekday features of routes that skip the representative weekday (#710), and days whose only
  // service is the previous night's after-midnight tail (#718): no stop metrics.
  const partialWeekdayFeatures = new Set<GeoJsonFeature>();
  const featureBranchTripCount = new Map<GeoJsonFeature, number>();
  for (const result of results) {
    const key = `${result.route}::${result.dir}`;
    // Use the headsign-specific shape so each pattern (e.g. Bramalea GO vs Kitchener GO, or 
    // bidirectional bus routes with a shared direction_id) maps to its own correctly-lengthed geometry.
    const hKey = (result.headsign) ? `${key}::${result.headsign}` : null;
    const dayHKey = hKey && result.day ? `${hKey}::${result.day}` : null;
    const shapeId = (result.shapeId && shapeById.has(result.shapeId))
      ? result.shapeId
      : (dayHKey && headsignDisplayShapeByDay.has(dayHKey))
      ? headsignDisplayShapeByDay.get(dayHKey)
      : (hKey && headsignDisplayShape.has(hKey))
      ? headsignDisplayShape.get(hKey)
      : routeDirToDisplayShape.get(key);
    const points = shapeId ? shapeById.get(shapeId) : undefined;
    const hasRouteShape = points != null && points.length >= 2;
    const maplessSequence = hasRouteShape ? [] : maplessStopSequenceForResult(result);
    const firstMaplessStop = maplessSequence.length > 0 ? stopsById.get(maplessSequence[0]) : undefined;
    const fallbackPoint = firstMaplessStop
      ? [Math.round(firstMaplessStop.lon * 100000) / 100000, Math.round(firstMaplessStop.lat * 100000) / 100000]
      : null;
    if (!hasRouteShape && !fallbackPoint) continue;

    const route = routeById.get(result.route);
    const shortName = route?.route_short_name ?? result.route;
    // Normalize headsign for dedup using the same clean function as display.
    // This collapses raw variants (e.g. "Hancock", "To Hancock Plaza") that clean to the same label.
    const routeLongName = route?.route_long_name?.trim() ?? null;
    const cleanedForDedup = resolveDisplayHeadsign(result.headsign, shortName, routeLongName);
    // Deduplicate by (shortName, dir, day, headsign) so separate directions and terminuses
    // aren't collapsed together.
    const branchKey = result.routeVariant?.trim() || '';
    const groupName = routeGroupName(route, result.route);
    const dedupeKey = cleanedForDedup
      ? `${groupName}::${result.dir}::${result.day}::${cleanedForDedup}::${branchKey}`
      : `${groupName}::${result.dir}::${result.day}::${branchKey}`;
    const existing = dedupedFeatures.get(dedupeKey);
    const incumbent = dedupedPattern.get(dedupeKey);
    const isRailRoute = String(route?.route_type) === '2';
    const initialPeriodHeadways = computePeriodHeadways(result.times);
    const notRated = result.partialWeekday || result.previousNightTailOnly || result.serviceClass === 'irregular' || result.tier === 'span';
    const newHeadway = notRated ? null : Math.round(initialPeriodHeadways.midday ?? result.medianHeadway);
    // Dedupe picks the shape that speaks for the slot by the plain median, as before #772, so
    // reading alternating gaps honestly never swaps which shape is drawn.
    const newDedupeHeadway = notRated ? null
      : Math.round(computePeriodHeadways(result.times, false).midday ?? result.plainMedianHeadway ?? result.medianHeadway);
    // The slot's representative weekday (#716) and how much of the slot this pattern carries
    // on it: the dedupe rules themselves are in featureDedupe.ts.
    const repWeekday = result.day === 'Weekday'
      ? (cleanedForDedup ? representativeWeekday.headsign.get(`${groupName}::${result.dir}::${cleanedForDedup}`) : undefined)
        ?? representativeWeekday.group.get(`${groupName}::${result.dir}`)
      : undefined;
    // A pattern "carries" the representative weekday when it has at least half of the slot's
    // departures on it. A thin fragment (capmetro gives nearly every trip its own shape) is
    // never preferred over a more frequent pattern just for running on that day.
    const repIndex = repWeekday != null ? WEEKDAYS.indexOf(repWeekday) : -1;
    const slotCounts = repWeekday == null ? undefined
      : (cleanedForDedup ? weekdayCounts.headsign.get(`${groupName}::${result.dir}::${cleanedForDedup}`) : undefined)
        ?? weekdayCounts.group.get(`${groupName}::${result.dir}`);
    const shapeCounts = result.shapeId ? weekdayCounts.shape.get(result.shapeId) : undefined;
    const newRunsOnRepDay = repWeekday != null && (result.daysIncluded?.includes(repWeekday) ?? false);
    const newCarriesRepDay = newRunsOnRepDay && shapeCounts != null && slotCounts != null
      && shapeCounts[repIndex] * 2 >= slotCounts[repIndex];
    const candidate: DedupePattern = {
      hasShape: hasRouteShape,
      dedupeHeadway: newDedupeHeadway,
      headway: newHeadway,
      departures: new Set(result.times).size,
      hasDaytime: result.times.some(t => t >= 540 && t < 1140),
      runsInDay: runsInDay(initialPeriodHeadways),
      runsMidday: initialPeriodHeadways.midday != null,
      runsOnRepDay: newRunsOnRepDay,
      carriesRepDay: newCarriesRepDay,
    };
    if (decideDedupe(incumbent, candidate, repWeekday) === 'keep') continue;

    const newFeature: GeoJsonFeature = {
      type: 'Feature',
      geometry: hasRouteShape
        ? {
            type: 'LineString',
            coordinates: points!.map(([lat, lon]) => [
              Math.round(lon * 100000) / 100000,
              Math.round(lat * 100000) / 100000,
            ]),
          }
        : { type: 'Point', coordinates: fallbackPoint! },
      properties: {
        routeId: result.route,
        directionId: parseInt(result.dir),
        routeDataQualityWarning: hasRouteShape && shapeId
          ? routeDataQualityWarningForShape(shapeId, gtfs.shapeAnomalies)
          : undefined,
        noRouteShape: !hasRouteShape,
        tier: result.tier,
        weekdayTierVariation: result.weekdayTierVariation,
        edgeGapAllowance: result.edgeGapAllowance,
        serviceClass: result.serviceClass ?? (result.tier === 'span' ? 'irregular' : 'regular'),
        headway: newHeadway,
        headwayByPeriod: computePeriodHeadways(result.times),
        periodCoverageHeadway: computePeriodCoverageHeadways(result.times),
        headwayRangeByPeriod: computePeriodHeadwayRanges(result.times),
        maxGapByPeriod: computePeriodMaxGaps(result.times),
        headwayByPeriodSustained: computePeriodSustained(result.times),
        partialWeekdayServiceByPeriod: result.partialWeekday
          ? Object.fromEntries(PERIOD_KEYS.map(key => [key, result.partialWeekdayPeriods?.includes(key) ?? false]))
          : undefined,
        headwayByHour: (() => {
          const byHour: HeadwayByHour = {};
          for (const h of SPARKLINE_HOURS) {
            // Two departures can be an accidental cluster on a sparse route (e.g. HRT 967).
            // Require three before exposing an hourly sparkline headway -- but only widen past a
            // strict hour when that hour doesn't already have 3 on its own (issue #282).
            byHour[h] = adaptiveMedianHeadwayInWindow(result.times, h * 60, 3);
          }
          return byHour;
        })(),
        maxGapByHour: computeHourMaxGaps(result.times, SPARKLINE_HOURS),
        routeShortName: shortName,
        routeVariant: result.routeVariant ?? null,
        routeLongName: route?.route_long_name ?? null,
        routeBranch: deriveRouteBranch(options?.slug, shortName, resolveDisplayHeadsign(result.headsign, shortName, routeLongName)),
        routeColor: route?.route_color ?? null,
        routeType: parseInt(result.routeType || '3'),
        busSubType: detectBusSubType(result.routeType, shortName, route?.route_long_name ?? null, options?.slug),
        baseFare: routeBaseFares.get(result.route) ?? null,
        day: result.day,
        headsign: resolveDisplayHeadsign(result.headsign, shortName, routeLongName)
          ?? routeDirToHeadsign.get(key) ?? null,
      },
    };
    if (existing) maplessStopSequence.delete(existing);
    dedupedFeatures.set(dedupeKey, newFeature);
    dedupedPattern.set(dedupeKey, candidate);
    if (!hasRouteShape) maplessStopSequence.set(newFeature, maplessSequence);
    if (hasRouteShape && shapeId) featureShapeId.set(newFeature, shapeId);
    featureGroupName.set(newFeature, groupName);
    featureBranchTripCount.set(newFeature, result.times.length);
    if (result.partialWeekday || result.previousNightTailOnly) partialWeekdayFeatures.add(newFeature);
    else partialWeekdayFeatures.delete(newFeature);
  }
  const features = [...dedupedFeatures.values()];

  // Attach per-stop headways — populated once stop_times are scanned below.
  // We store a reference to the pending map so the loop below can fill it.
  const featureStopHeadwaySlots = new Map<GeoJsonFeature, { shortName: string; dirId: string; day: string }>();
  for (const feature of features) {
    const p = feature.properties;
    if (p.routeShortName != null && p.directionId != null && p.day) {
      featureStopHeadwaySlots.set(feature, {
        shortName: featureGroupName.get(feature) ?? (p.routeShortName as string),
        dirId: String(p.directionId),
        day: p.day as string,
      });
    }
  }

  for (const [feature, slot] of featureStopHeadwaySlots) {
    if (partialWeekdayFeatures.has(feature) || !isPoolablePattern(feature)) continue;
    sharedEligibleHeadsigns.add(`${slot.shortName}::${slot.dirId}::${slot.day}::${feature.properties.routeId}::${(feature.properties.headsign as string | null) ?? ''}`);
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

  // A trip's own minute must be below this to be eligible for the night-service shift, AND
  // its service_id's max (serviceIdMaxMinute) must also be below it -- see that map's comment.
  const NIGHT_SHIFT_EARLY_CUTOFF = NIGHT_SERVICE_WINDOW_END_MIN - 1440;

  // A trip with usable frequencies.txt rows is a template: GTFS reads its
  // stop_times only as offsets from each generated start, and the expansion
  // below adds every departure it really makes. Its literal times are not a
  // departure of their own (uga writes templates at 00:00, which showed as
  // fake late-night service, #721). Decided from the rows before any dedupe,
  // so a template whose windows all repeat the timetable adds nothing.
  const frequencyTemplateTripIds = new Set<string>();
  for (const frequency of gtfs.frequencies ?? []) {
    // Same row validity as the expansion (parseFrequencyWindow, shared with
    // route level, #706): a trip whose rows are all unusable keeps its literal
    // stop_times instead of losing every departure.
    const window = parseFrequencyWindow(frequency);
    if (window && window.end > window.start) frequencyTemplateTripIds.add(frequency.trip_id);
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
    const chainedEnd = chainedTripEnds.get(`${st.trip_id}|${st.stop_id}|${st.stop_sequence}`);
    const tripGroups = frequencyTemplateTripIds.has(st.trip_id) ? [] : (tripGroupByTripId.get(st.trip_id) ?? []);
    for (const grp of tripGroups) {
      const timeStr = st.departure_time || st.arrival_time;
      if (timeStr) {
        const mins = t2m(timeStr);
        if (mins !== null) {
          const gKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}`;
          const hsKey = grp.headsign ? `${grp.shortName}::${grp.dirId}::${grp.dayType}::${grp.headsign}` : null;
          const shKey = grp.shapeId ? `${grp.shapeId}::${grp.dayType}` : null;
          const smKey = sharedMemberKey(grp);
          const pushDep = (maps: Map<string, Map<string, number[]>>, key: string, stopId: string, mins: number) => {
            let map = maps.get(key);
            if (!map) { map = new Map(); maps.set(key, map); }
            let arr = map.get(stopId);
            if (!arr) { arr = []; map.set(stopId, arr); }
            arr.push(mins);
          };
          const night = mins < NIGHT_SHIFT_EARLY_CUTOFF && (serviceIdMaxMinute.get(grp.serviceId) ?? Infinity) < NIGHT_SHIFT_EARLY_CUTOFF;
          const pushAll = (stopId: string) => {
            const pooledOk = chainedEnd === undefined;
            const headsignOk = chainedEnd !== true;
            if (grp.inGroup && pooledOk) pushDep(stopDepsByGroup, gKey, stopId, mins);
            if (hsKey && grp.inHeadsign && headsignOk) pushDep(stopDepsByHeadsignGroup, hsKey, stopId, mins);
            if (shKey && grp.inShape) pushDep(stopDepsByShapeGroup, shKey, stopId, mins);
            // Drop-off-only stop times (pickup_type 1) are not departures a rider can take.
            if (smKey && grp.inGroup && pooledOk && st.pickup_type?.trim() !== '1') pushDep(stopDepsBySharedMember, smKey, stopId, mins);
            // Night-service-only shift (#297) -- see stopDepsByGroupNight declaration above.
            if (night) {
              if (grp.inGroup && pooledOk) pushDep(stopDepsByGroupNight, gKey, stopId, mins + 1440);
              if (hsKey && grp.inHeadsign && headsignOk) pushDep(stopDepsByHeadsignGroupNight, hsKey, stopId, mins + 1440);
            }
          };
          // Only count first visit per (trip, stop) — loop routes visit the terminus
          // at both the start and end of each trip, which would otherwise interleave
          // outbound and inbound times to produce a falsely short headway (AI-121).
          let visitSet = stopFirstVisit.get(st.trip_id);
          if (!visitSet) { visitSet = new Set(); stopFirstVisit.set(st.trip_id, visitSet); }
          const visitKey = `${grp.dayType}:${st.stop_id}`;
          if (!visitSet.has(visitKey)) {
            visitSet.add(visitKey);
            pushAll(st.stop_id);
            // Propagate to parent station so it also gets headways (only count first visit to parent per trip)
            const parentVisitKey = parentId ? `${grp.dayType}:${parentId}` : null;
            if (parentId && parentVisitKey && !visitSet.has(parentVisitKey)) {
              visitSet.add(parentVisitKey);
              pushAll(parentId);
            }
          }
        }
      }
    }
  }

  // A thin-shape feature's scoped headline (scopedTerminalHeadline) reads only its own branch:
  // the headsign's trips that serve at least two thirds of the drawn shape's stops, at the
  // shape's last stop. Every trip of a headsign at a shared last stop over-claims a branch that
  // converges there: ttc 94 to Castle Frank runs from Ossington (26 stops) and from Wellesley
  // Station (11 of them), every 19-20 each and every 10 together. A share rather than the first
  // stop, so an early shape that starts at a carhouse still reads its main trips. Built lazily:
  // it fires on few features.
  const branchPoolCache = new Map<string, Map<string, Map<string, number>>>();
  // Built once on first use (#728 reads the pool for every line): stop_times by trip and the
  // trips of each headsign group, so a pool read touches only its own trips.
  let stopTimeIdxByTrip: Map<string, number[]> | null = null;
  let tripsByHsKey: Map<string, string[]> | null = null;
  // Weekday headsign groups over every weekday's trips (not only the representative weekday's),
  // with each trip's service_id, so a pool can be graded on the other weekdays too.
  let weekdayTripsByHsKey: Map<string, Array<[string, string]>> | null = null;
  const buildBranchIndex = () => {
    stopTimeIdxByTrip = new Map();
    const sts = gtfs.stopTimes ?? [];
    for (let i = 0; i < sts.length; i++) {
      const tid = sts[i].trip_id;
      if (frequencyTemplateTripIds.has(tid)) continue;
      let arr = stopTimeIdxByTrip.get(tid);
      if (!arr) { arr = []; stopTimeIdxByTrip.set(tid, arr); }
      arr.push(i);
    }
    const sets = new Map<string, Set<string>>();
    weekdayTripsByHsKey = new Map();
    for (const [tid, grps] of tripGroupByTripId) {
      for (const g of grps) {
        if (!g.headsign) continue;
        const k = `${g.shortName}::${g.dirId}::${g.dayType}::${g.headsign}`;
        if (g.dayType === 'Weekday' && !frequencyTemplateTripIds.has(tid)) {
          let list = weekdayTripsByHsKey.get(k);
          if (!list) { list = []; weekdayTripsByHsKey.set(k, list); }
          list.push([tid, g.serviceId]);
        }
        if (!g.inHeadsign) continue;
        let set = sets.get(k);
        if (!set) { set = new Set(); sets.set(k, set); }
        set.add(tid);
      }
    }
    tripsByHsKey = new Map([...sets].map(([k, set]) => [k, [...set]]));
  };
  /**
   * The other weekdays a Weekday pool must also be graded on (#728): each weekday whose active
   * trips under this headsign differ from the representative weekday's, once per distinct trip
   * set. Phase 1 reads one weekday (the busiest, the earliest on a tie), so a service that runs
   * Tuesday to Friday only is invisible to it (septa T2 and T3: Monday ties Tuesday-Friday at
   * 125 trips, and the Tuesday-Friday service adds a 21-minute gap at 21:38).
   */
  const otherWeekdayPools = (hsKey: string): Array<{ name: DayName; tripIds: Set<string> }> => {
    if (!stopTimeIdxByTrip || !tripsByHsKey) buildBranchIndex();
    const representative = new Set(tripsByHsKey!.get(hsKey) ?? []);
    const all = weekdayTripsByHsKey!.get(hsKey) ?? [];
    const out: Array<{ name: DayName; tripIds: Set<string> }> = [];
    const seen: Set<string>[] = [representative];
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(id => b.has(id));
    for (const name of WEEKDAYS) {
      const active = activeServiceIdsByCalendarDay.get(name);
      if (!active) continue;
      const tripIds = new Set(all.filter(([, serviceId]) => active.has(serviceId)).map(([tid]) => tid));
      if (tripIds.size === 0 || seen.some(set => same(set, tripIds))) continue;
      seen.push(tripIds);
      out.push({ name, tripIds });
    }
    return out;
  };
  // The destination pool's trips for a drawn line: the headsign's trips serving at least two
  // thirds of the drawn stops, each with its first-visit time at every drawn stop it serves.
  // With fullOuterThird (#728) a trip must also serve every stop of the drawn line's last third,
  // so a variant that reaches the terminal by another road never lifts the tier for riders on
  // the outer stops it skips (camtran 13: 4 of 11 pooled trips skipped outer stops, outer third
  // 180 minutes between buses).
  const branchPoolTrips = (hsKey: string, shapeStopIds: readonly string[], fullOuterThird = false, weekday?: { name: DayName; tripIds: Set<string> }): Map<string, Map<string, number>> => {
    const cacheKey = `${hsKey}|${weekday ? `${weekday.name}|` : ''}${fullOuterThird ? 'outer|' : ''}${shapeStopIds.join(',')}`;
    const hit = branchPoolCache.get(cacheKey);
    if (hit) return hit;
    if (!stopTimeIdxByTrip || !tripsByHsKey) buildBranchIndex();
    const shapeStops = new Set(shapeStopIds);
    const served = new Map<string, Map<string, { seq: number; mins: number }>>();
    const sts = gtfs.stopTimes ?? [];
    for (const tid of weekday?.tripIds ?? tripsByHsKey!.get(hsKey) ?? []) {
      for (const i of stopTimeIdxByTrip!.get(tid) ?? []) {
        const st = sts[i];
        const parentId = childToParent.get(st.stop_id);
        const timeStr = st.departure_time || st.arrival_time;
        const mins = timeStr ? t2m(timeStr) : null;
        if (mins == null) continue;
        const seq = Number(st.stop_sequence);
        for (const id of [st.stop_id, parentId]) {
          if (id == null || !shapeStops.has(id)) continue;
          let byStop = served.get(tid);
          if (!byStop) { byStop = new Map(); served.set(tid, byStop); }
          const prev = byStop.get(id);
          if (!prev || seq < prev.seq) byStop.set(id, { seq, mins });
        }
      }
    }
    const outerThird = shapeStopIds.slice(Math.floor(shapeStopIds.length * 2 / 3));
    const trips = new Map<string, Map<string, number>>();
    for (const [tid, byStop] of served) {
      if (byStop.size * 3 < shapeStops.size * 2) continue;
      if (fullOuterThird && !outerThird.every(id => byStop.has(id))) continue;
      trips.set(tid, new Map([...byStop].map(([id, v]) => [id, v.mins])));
    }
    branchPoolCache.set(cacheKey, trips);
    return trips;
  };
  /** The pool's departure times at one drawn stop (one per trip that serves it). */
  const branchPoolTimesAt = (hsKey: string, shapeStopIds: readonly string[], stopId: string, fullOuterThird = false, weekday?: { name: DayName; tripIds: Set<string> }): number[] => {
    const times: number[] = [];
    for (const byStop of branchPoolTrips(hsKey, shapeStopIds, fullOuterThird, weekday).values()) {
      const mins = byStop.get(stopId);
      if (mins != null) times.push(mins);
    }
    return times;
  };
  const branchTerminalTimes = (hsKey: string, shapeStopIds: readonly string[], terminalId: string, fullOuterThird = false): number[] =>
    branchPoolTimesAt(hsKey, shapeStopIds, terminalId, fullOuterThird);

  const pushUnique = (map: Map<string, Map<string, number[]>>, key: string, stopId: string, mins: number) => {
    let stopMap = map.get(key);
    if (!stopMap) { stopMap = new Map(); map.set(key, stopMap); }
    const arr = stopMap.get(stopId) ?? [];
    if (!arr.includes(mins)) arr.push(mins);
    stopMap.set(stopId, arr);
  };
  const addFrequencyDeparture = (grp: StopTripGroup, stopId: string, mins: number, pickupAllowed = true) => {
    const groupKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}`;
    if (grp.inGroup) pushUnique(stopDepsByGroup, groupKey, stopId, mins);
    if (grp.headsign && grp.inHeadsign) pushUnique(stopDepsByHeadsignGroup, `${grp.shortName}::${grp.dirId}::${grp.dayType}::${grp.headsign}`, stopId, mins);
    if (grp.shapeId && grp.inShape) pushUnique(stopDepsByShapeGroup, `${grp.shapeId}::${grp.dayType}`, stopId, mins);
    const smKey = sharedMemberKey(grp);
    if (smKey && grp.inGroup && pickupAllowed) pushUnique(stopDepsBySharedMember, smKey, stopId, mins);
    if (mins < NIGHT_SHIFT_EARLY_CUTOFF && (serviceIdMaxMinute.get(grp.serviceId) ?? Infinity) < NIGHT_SHIFT_EARLY_CUTOFF) {
      const shifted = mins + 1440;
      if (grp.inGroup) pushUnique(stopDepsByGroupNight, groupKey, stopId, shifted);
      if (grp.headsign && grp.inHeadsign) pushUnique(stopDepsByHeadsignGroupNight, `${grp.shortName}::${grp.dirId}::${grp.dayType}::${grp.headsign}`, stopId, shifted);
    }
  };
  // Group rows by trip (file order) so overlapping windows on one trip can be
  // deduplicated, then group templates by route/service/direction/stop pattern
  // so windows that repeat the feed's own timetable are skipped (#711).
  const frequencyRowsByTripId = new Map<string, FrequencyWindow[]>();
  for (const frequency of gtfs.frequencies ?? []) {
    // Same row validity as route level (transit-phase1), so both agree on
    // each trip's row count for the single-row rule (#706).
    const window = parseFrequencyWindow(frequency);
    if (!window) continue;
    const rows = frequencyRowsByTripId.get(frequency.trip_id) ?? [];
    rows.push(window);
    frequencyRowsByTripId.set(frequency.trip_id, rows);
  }
  // Templates and timetable trips are matched on route, service, direction and
  // the exact stop pattern, so short turns and other variants never vouch for
  // a template they do not repeat.
  const stopPatternByTripId = (tripId: string) =>
    (stopTimesByTripId.get(tripId) ?? [])
      .slice()
      .sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
      .map(st => st.stop_id)
      .join('>');
  const scheduleKey = (trip: { trip_id: string; route_id: string; service_id: string; direction_id?: string | number | null }) =>
    `${trip.route_id}::${trip.service_id}::${String(trip.direction_id ?? '')}::${stopPatternByTripId(trip.trip_id)}`;
  type FrequencyTemplate = { tripId: string; first: number; tripSpan: number | undefined; windows: FrequencyWindow[]; offsets: number[]; departures: number };
  const templatesByKey = new Map<string, FrequencyTemplate[]>();
  for (const [tripId, windows] of frequencyRowsByTripId) {
    const first = firstDepartureByTripId.get(tripId);
    const trip = tripById.get(tripId);
    if (first === undefined || !trip) continue;
    const last = lastDepartureByTripId.get(tripId);
    const tripSpan = last === undefined ? undefined : last - first;
    const offsets = expandTripFrequencyOffsets(first, windows, tripSpan);
    const key = scheduleKey(trip);
    const list = templatesByKey.get(key) ?? [];
    list.push({ tripId, first, tripSpan, windows, offsets, departures: offsets.length });
    templatesByKey.set(key, list);
  }
  const scheduledStartsByKey = new Map<string, number[]>();
  if (templatesByKey.size > 0) {
    const templateRoutes = new Set([...frequencyRowsByTripId.keys()].map(tripId => tripById.get(tripId)?.route_id));
    for (const trip of gtfs.trips ?? []) {
      if (frequencyRowsByTripId.has(trip.trip_id) || !templateRoutes.has(trip.route_id)) continue;
      const key = scheduleKey(trip);
      if (!templatesByKey.has(key)) continue;
      const first = firstDepartureByTripId.get(trip.trip_id);
      if (first === undefined) continue;
      const starts = scheduledStartsByKey.get(key) ?? [];
      starts.push(first);
      scheduledStartsByKey.set(key, starts);
    }
  }
  for (const [key, templates] of templatesByKey) {
    // A single-trip row (#702) is a trip, not a template, so it never repeats
    // the timetable: cue-bus TL-2's 05:50-06:21 row holds the 06:00 timetable
    // start but is its own 05:50 departure. Its literal stop_times no longer
    // stand in for it (#721), so dropping it would lose a real trip.
    const repeated = windowsRepeatedByTimetable(
      templates.map(template => ({ ...template, windows: template.windows.filter(window => !isSingleTripWindow(window, template.tripSpan, template.windows.length)) })),
      scheduledStartsByKey.get(key) ?? [],
    );
    const distinctOffsets = dropCoincidentTemplateDepartures(templates);
    for (const [index, { tripId, first, windows }] of templates.entries()) {
      const allOffsets = distinctOffsets[index];
      const tripStops = stopTimesByTripId.get(tripId);
      const groups = tripGroupByTripId.get(tripId);
      const droppedWindows = windows.filter(window => repeated.has(window));
      // Departures inside a window the timetable already lists are counted by
      // the stop_times pass; every other window keeps its generated service.
      const offsets = droppedWindows.length === 0
        ? allOffsets
        : allOffsets.filter(offset => !droppedWindows.some(window => first + offset >= window.start && first + offset < window.end));
      if (!tripStops || !groups || offsets.length === 0) continue;
      const visits = firstVisitStopTimes(tripStops);
      const stretched = isStretchedBlockTrip(tripStops, windows);
      for (const offset of offsets) {
        // Count each station once per trip as well: a trip that serves two
        // platforms of one parent station adds one departure to the station.
        const seenParents = new Set<string>();
        for (const st of visits) {
          const literal = t2m(st.departure_time || st.arrival_time);
          if (literal === null) continue;
          // A stretched block's literal times are not run-time offsets: every
          // timed stop gets the generated start itself (run time unknown).
          const base = stretched ? first : literal;
          const mins = base + offset;
          const parentId = childToParent.get(st.stop_id);
          const countParent = parentId !== undefined && !seenParents.has(parentId);
          if (parentId) seenParents.add(parentId);
          for (const grp of groups) {
            const pickupAllowed = st.pickup_type?.trim() !== '1';
            addFrequencyDeparture(grp, st.stop_id, mins, pickupAllowed);
            if (countParent) addFrequencyDeparture(grp, parentId!, mins, pickupAllowed);
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
      shorts.add(routeGroupName(routeById.get(rid), rid));
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

  // CIV-82: pooled values at stops a route direction's patterns really share. Adds new keys
  // only; every value above is unchanged. Each pattern's stop sequence comes from its
  // longest trip that runs on the group's day (first visit per stop).
  const sharedPatternTrip = new Map<string, { poolKey: string; routeId: string; headsigns: Set<string>; tripId: string; stops: number }>();
  for (const trip of gtfs.trips ?? []) {
    const stops = stopTimesByTripId.get(trip.trip_id)?.length ?? 0;
    if (stops < 2) continue;
    for (const grp of tripGroupByTripId.get(trip.trip_id) ?? []) {
      // Same trips as the pooled departures: eligible headsigns on the group's day.
      if (!grp.inGroup || !sharedMemberKey(grp)) continue;
      const member = sharedPatternKey(grp.routeId, grp.headsign, grp.shapeId);
      if (!member) continue;
      const poolKey = `${grp.shortName}::${grp.dirId}::${grp.dayType}`;
      const key = `${poolKey}::${member}`;
      const prev = sharedPatternTrip.get(key);
      if (!prev) sharedPatternTrip.set(key, { poolKey, routeId: grp.routeId, headsigns: new Set([grp.headsign ?? '']), tripId: trip.trip_id, stops });
      else {
        prev.headsigns.add(grp.headsign ?? '');
        if (stops > prev.stops) { prev.tripId = trip.trip_id; prev.stops = stops; }
      }
    }
  }
  const sharedPatternsByPool = new Map<string, Array<{ memberKey: string; routeId: string; headsigns: string[]; tripId: string }>>();
  for (const [key, entry] of sharedPatternTrip) {
    const list = sharedPatternsByPool.get(entry.poolKey) ?? [];
    list.push({ memberKey: key.slice(entry.poolKey.length + 2), routeId: entry.routeId, headsigns: [...entry.headsigns].sort(), tripId: entry.tripId });
    sharedPatternsByPool.set(entry.poolKey, list);
  }

  // Patterns of each route group, direction and day, with each pattern's stop sequence: read by
  // the per-stop pools below (#690) and by annotateSharedStretches after the loop.
  const sharedPatternsOf = (poolKey: string): SharedStretchPattern[] => (sharedPatternsByPool.get(poolKey) ?? []).map(pattern => ({
    memberKey: pattern.memberKey,
    routeId: pattern.routeId,
    headsigns: pattern.headsigns,
    stopOrder: firstVisitStopTimes(stopTimesByTripId.get(pattern.tripId) ?? []).map(st => st.stop_id),
  }));
  // #690: which patterns pool with a feature's own pattern at each station, per route group.
  const stopSharersByPool = new Map<string, ReadonlyMap<string, StopSharers>>();
  const stopSharersFor = (poolKey: string): ReadonlyMap<string, StopSharers> => {
    let hit = stopSharersByPool.get(poolKey);
    if (!hit) { hit = computeStopSharers(sharedPatternsOf(poolKey), stopsById, childToParent); stopSharersByPool.set(poolKey, hit); }
    return hit;
  };

  for (const [feature, { shortName, dirId, day }] of featureStopHeadwaySlots) {
    // Same reasoning for frequentService (#294 follow-on, see docs/research/frequent-service-research-2026-09/CRITERIA.md).
    feature.properties.frequentService = false;
    feature.properties.researchFrequentService = { daytime15: false, daytime30: false, extended15: false, extended30: false };
    feature.properties.nightService30 = false;
    feature.properties.nightService60 = false;
    const gKey = `${shortName}::${dirId}::${day}`;
    const stopMap = stopDepsByGroup.get(gKey);
    if (!stopMap || partialWeekdayFeatures.has(feature)) {
      feature.properties.nightService = false;
      continue;
    }
    const featureHeadsign = feature.properties.headsign as string | null;
    const featureRoute = routeById.get(feature.properties.routeId as string);
    const railFeature = isRailLikeRoute({
      routeType: featureRoute?.route_type,
      routeLongName: featureRoute?.route_long_name,
      routeShortName: featureRoute?.route_short_name,
    });
    const headsignMap = featureHeadsign
      ? stopDepsByHeadsignGroup.get(`${shortName}::${dirId}::${day}::${featureHeadsign}`)
      : undefined;
    // Shape-scoped is the most specific: prefer it whenever this feature's shape has its
    // own departure history, since headsign text can be reused across genuinely different
    // physical patterns (NRT 301/401 reuse one generic headsign for unrelated shapes).
    const featureShape = featureShapeId.get(feature);
    // Weekday: a shape map describes its own served weekday (#710). When the shape does not
    // run on the route direction's representative weekday, the feature's stop and terminal
    // values come from a different day than the rest of the route (capmetro 550: a
    // Friday-only shape won the Weekday headline and its 3-5 Friday trips set it to 240/336
    // instead of the Mon-Thu timetable). Such a feature reads the headsign map instead (on
    // the headsign's own typical weekday), then the group map, as before the weekday union
    // (#595). The skip needs all of:
    // - the shape has fewer than two departures on the group's representative weekday, so a
    //   shape that runs every weekday keeps its own map even when its tie-break picked
    //   another day (TTC: shape Monday, group Tuesday);
    // - it runs on at most two weekdays, or on none of the route's typical weekdays (those
    //   with the representative day's count), so a Mon/Wed/Fri branch keeps its own data
    //   and is never replaced by a shared trunk headsign pool;
    // - it is a fragment of its own day's service (under half the direction's departures
    //   that day). A shape that carries its day, such as cata-state-college VE's Friday
    //   pattern (31 of 32 trips) or LANTA's one shape per weekday, still describes the
    //   route and keeps its own data (#710).
    const groupKey = `${shortName}::${dirId}`;
    const groupWeekday = day === 'Weekday' ? representativeWeekday.group.get(groupKey) : undefined;
    const shapeCountsByWeekday = groupWeekday != null && featureShape ? weekdayCounts.shape.get(featureShape) : undefined;
    const shapeOwnWeekday = featureShape ? representativeWeekday.shape.get(featureShape) : undefined;
    const groupCountsByWeekday = weekdayCounts.group.get(groupKey);
    const typicalWeekdayCount = groupWeekday != null && groupCountsByWeekday != null ? groupCountsByWeekday[WEEKDAYS.indexOf(groupWeekday)] : 0;
    const shapeServedWeekdays = shapeCountsByWeekday ? shapeCountsByWeekday.filter(count => count >= 2).length : 0;
    const shapeOnTypicalWeekday = shapeCountsByWeekday != null && groupCountsByWeekday != null
      && WEEKDAYS.some((_, index) => groupCountsByWeekday[index] === typicalWeekdayCount && shapeCountsByWeekday[index] >= 2);
    const shapeOffRepresentativeDay = groupWeekday != null && shapeCountsByWeekday != null
      && shapeCountsByWeekday[WEEKDAYS.indexOf(groupWeekday)] < 2
      && (shapeServedWeekdays <= 2 || !shapeOnTypicalWeekday)
      && shapeOwnWeekday != null && groupCountsByWeekday != null
      && shapeCountsByWeekday[WEEKDAYS.indexOf(shapeOwnWeekday)] * 2 < groupCountsByWeekday[WEEKDAYS.indexOf(shapeOwnWeekday)];
    // A Weekday feature whose shape is a minor fragment of its own headsign (under half the
    // headsign's departures on the shape's day) and too thin to give any stop a headway would
    // keep the fragment's phase-2 value as its headline, since Step 4 never runs (capmetro
    // 550 SB, fresh feed: CapMetro gives nearly every trip its own shape, and shape 4610,
    // 5 of 16 Mon-Thu Downtown trips, set 222 against a timetable every 45-50). Such a
    // feature reads its own headsign's pool, which is the same displayed destination. Only
    // when the headsign's trips run exactly the shape's stops (the pool has no stop the shape
    // lacks, and every shape stop is served by at least half of the pool's busiest stop), so
    // the shapes are one pattern under different IDs. Branches sharing a headsign (TTC 35A/B
    // to Mount Dennis), short turns and night-route pieces (TTC 354/395) fail this and keep
    // their own data, as does a shape that carries its headsign.
    const ownShapeMap = featureShape ? stopDepsByShapeGroup.get(`${featureShape}::${day}`) : undefined;
    const headsignCountsByWeekday = featureHeadsign ? weekdayCounts.headsign.get(`${shortName}::${dirId}::${featureHeadsign}`) : undefined;
    const ownDayIndex = shapeOwnWeekday != null ? WEEKDAYS.indexOf(shapeOwnWeekday) : -1;
    const shapeIsThinHeadsignFragment = day === 'Weekday' && !shapeOffRepresentativeDay
      && ownShapeMap != null && headsignMap != null && ownDayIndex >= 0
      && shapeCountsByWeekday != null && headsignCountsByWeekday != null
      && shapeCountsByWeekday[ownDayIndex] * 2 < headsignCountsByWeekday[ownDayIndex]
      && (() => {
        const busiest = Math.max(0, ...[...headsignMap.values()].map(times => times.length));
        return busiest > 0
          && [...ownShapeMap.keys()].every(stopId => (headsignMap.get(stopId)?.length ?? 0) * 2 >= busiest)
          && [...headsignMap.keys()].every(stopId => ownShapeMap.has(stopId))
          // The pool must have daytime service of its own (midday or PM peak), so a night
          // route's pre-dawn pieces never become a daytime headline (TTC 354: 30 -> 10).
          && [...headsignMap.values()].some(times => {
            const sorted = [...times].sort((a, b) => a - b);
            return (medianHeadwayInWindow(sorted, 540, 900, 3) ?? medianHeadwayInWindow(sorted, 900, 1140, 3)) != null;
          });
      })()
      && ![...ownShapeMap.values()].some(times => {
        const sorted = [...times].sort((a, b) => a - b);
        return (medianHeadwayInWindow(sorted, 540, 900, 3)
          ?? medianHeadwayInWindow(sorted, 900, 1140, 3)
          ?? sustainedMedianHeadwayInWindow(sorted, 360, 1320, 3)) != null;
      });
    const shapeMap = !shapeOffRepresentativeDay && !shapeIsThinHeadsignFragment ? ownShapeMap : undefined;
    // Rail feeds commonly publish several physical shapes for one displayed line and
    // destination (short turns, service patterns, or timetable variants). For buses, a
    // shape-scoped map prevents unrelated branches from being combined; for rail, the
    // same-destination headsign pool preserves service that would otherwise disappear
    // when the daytime shape wins feature deduplication (e.g. TTC Lines 1 and 2 evening).
    const metricStopMap = railFeature
      ? (headsignMap ?? shapeMap ?? stopMap)
      : (shapeMap ?? headsignMap ?? stopMap);
    // #690: the stop values below read what serves each stop, not only the drawn pattern. At
    // every stop where another pattern of this route direction pools with the feature's own
    // (computeStopSharers: an aligned shared run, or a same-destination variant), the stop's
    // departures are the merged lists. Only when the feature reads its own pattern's map (its
    // shape for buses, its headsign for rail): a feature that fell back to the headsign or group
    // map already pools, and would double-count. Night service, the headline and the tier keep
    // reading the own map or the branch-scoped destination pool (pooledHeadlineTimes).
    const poolKey = `${shortName}::${dirId}::${day}`;
    const ownMember = feature.geometry.type === 'LineString' && !partialWeekdayFeatures.has(feature) && isPoolablePattern(feature)
      ? sharedPatternKey(feature.properties.routeId as string, featureHeadsign, featureShape)
      : null;
    const ownIsPattern = railFeature ? (headsignMap != null && metricStopMap === headsignMap) : (shapeMap != null && metricStopMap === shapeMap);
    const pooled = ownMember && ownIsPattern && stopDepsBySharedMember.has(`${poolKey}::${ownMember}`)
      ? buildPooledStopMap(metricStopMap, stopSharersFor(poolKey).get(ownMember), key => stopDepsBySharedMember.get(`${poolKey}::${key}`), childToParent,
        stopDepsBySharedMember.get(`${poolKey}::${ownMember}`))
      : null;
    const stopMetricMap: Map<string, number[]> = pooled?.map ?? metricStopMap;

    // Night Service must be evaluated before the daytime stop-headway bail-outs below: a
    // genuinely overnight-only route has no 9am–7pm data, so allStopHw would otherwise be empty
    // and the feature would exit before ever receiving a true flag. Use the same shape/headsign-
    // scoped map selected for the feature's other metrics. Using the route-level map here can
    // pool departures from a different branch/pattern and make a route appear to cover the
    // whole 2am–6am window when this rendered pattern does not (#518).
    const isMapless = feature.geometry.type !== 'LineString';
    // Mapless: order stops by the representative trip's stop_sequence. Stops that trip does not
    // serve (other patterns pooled into the same metric map) follow in first-seen order.
    const representativeSequence = isMapless ? (maplessStopSequence.get(feature) ?? []) : [];
    const representativeStopIds = new Set(representativeSequence);
    const metricStopIdSet = new Set([...metricStopMap.keys()].filter(stopId => stopsById.has(stopId)));
    const metricStopIds = isMapless
      ? [
          ...representativeSequence.filter(stopId => metricStopIdSet.has(stopId)),
          ...[...metricStopIdSet].filter(stopId => !representativeStopIds.has(stopId)),
        ]
      : [];
    const maplessStopProjection = metricStopIds.map((stopId, index) => ({
      stopId,
      t: metricStopIds.length <= 1 ? 0 : index / (metricStopIds.length - 1),
      dev2: 0,
    }));
    const shapePts: [number, number][] = feature.geometry.type === 'LineString'
      ? feature.geometry.coordinates.map(([lon, lat]) => [lat, lon])
      : [];
    const nightShapeStops = isMapless
      ? maplessStopProjection
      : projectStopsOntoShape([...stopMap.keys()], stopsById, shapePts).filter(p => p.dev2 <= MAX_STOP_DEV2);
    const nightEndpointStopIds = [...new Set([
      nightShapeStops[0]?.stopId,
      nightShapeStops.at(-1)?.stopId,
    ].filter((id): id is string => id != null))];
    feature.properties.nightService30 = hasNightServiceAtShapeEndpoints(
      nightEndpointStopIds,
      metricStopMap,
      stopDepsByGroupNight.get(gKey),
      30,
    );
    feature.properties.nightService60 = hasNightServiceAtShapeEndpoints(
      nightEndpointStopIds,
      metricStopMap,
      stopDepsByGroupNight.get(gKey),
      60,
    );
    feature.properties.nightService = feature.properties.nightService60;

    // Step 1: compute all-day, per-period, and per-hour headways for every stop in the route+dir group.
    const allStopHw: Record<string, number> = {};
    // The same all-day and midday values on the plain median. Step 4's branch decision reads
    // these, so the alternating-gap reading only ever raises a headline (#772).
    const allStopHwPlain: Record<string, number> = {};
    const allStopMiddayHwPlain: Record<string, number> = {};
    const allStopPeriodHw: Record<string, Partial<Record<PeriodKey, number>>> = {};
    const allStopPeriodCoverageHw: Record<string, HeadwayByPeriod> = {};
    const allStopPeriodMaxGaps: Record<string, HeadwayByPeriodMaxGap> = {};
    const allStopPeriodSustained: Record<string, HeadwayByPeriodSustained> = {};
    const allStopHourHw: Record<string, HeadwayByHour> = {};
    // #771: pooled stops whose pooled reading published nothing and fell back to the drawn
    // pattern's own trips (all-day value, and per period). Other trips serve these stops, so the
    // fallback is not the stop's service and the worst-drawn-stop rule leaves it out.
    const ownFallbackHw = new Set<string>();
    const ownFallbackPeriodHw = new Map<string, Set<PeriodKey>>();
    for (const [stopId, times] of stopMetricMap) {
      times.sort((a, b) => a - b);
      // Prefer midday (9–15h) then PM peak (15–19h) rather than a raw all-day window.
      // An all-day median is skewed by peak clusters: Halifax 330 inbound has 9 AM trips
      // in a 105-min window → all-day median gap = 10 min despite no off-peak service.
      // Midday ?? PM peak correctly returns null for AM-peak-only routes, preventing them
      // from appearing with a misleading green dot in the stop card.
      //
      // Falls back further to a raw all-day (6–22h) window only when NEITHER midday nor PM
      // peak found enough departures, rather than nulling the stop out entirely (issue #279).
      // That window uses sustainedMedianHeadwayInWindow, not the plain median, specifically so
      // it doesn't reintroduce the original Halifax 330 bug: a plain all-day median is still
      // robust to a single outlier trip, so a route with a tight AM-peak cluster plus one stray
      // afternoon trip (330 is a rush-hour-only commuter express, not real all-day service)
      // would median right back down to the misleading peak-cluster gap. Rejecting a
      // disproportionate single gap catches that case while still rescuing routes with real,
      // consistent service that simply falls outside 9h–19h (e.g. TTC 32, 5–15min gaps all day).
      // A pooled stop (#690) reads the merged list with the pooled rule (pooledHeadwayInWindow:
      // never better than the mean gap, even gaps only); where that publishes nothing the stop
      // keeps its own pattern's value, as before.
      const isPooled = pooled?.pooledStops.has(stopId) === true;
      const own = isPooled ? [...(metricStopMap.get(stopId) ?? [])].sort((a, b) => a - b) : times;
      let usedOwnFallback = false;
      const windowHw = (start: number, end: number, allDay = false): number | null => {
        usedOwnFallback = false;
        if (isPooled) {
          const v = pooledHeadwayInWindow(times, start, end, 3, allDay, own);
          if (v != null) return v;
        }
        const v = allDay
          ? sustainedMedianHeadwayInWindow(own, start, end, 3, undefined, true)
          : medianHeadwayInWindow(own, start, end, 3, true);
        // The flag describes the window that produced the value: a later window read from the
        // pool clears it, and a window with no value from either list leaves no fallback.
        if (isPooled && v != null) usedOwnFallback = true;
        return v;
      };
      const hw = windowHw(540, 900)             // midday 9–15h
              ?? windowHw(900, 1140)            // PM peak 15–19h
              ?? windowHw(360, 1320, true);     // last resort: raw all-day 6–22h
      if (hw != null) allStopHw[stopId] = hw;

      // The plain values feed the #772 branch decision, which compares the own pattern's stops
      // with a shared terminal: they read the own list at a pooled stop too (ttc 38 weekday: the
      // pooled terminal's plain 7 would have beaten the branch's 15).
      const hwPlain = medianHeadwayInWindow(own, 540, 900, 3)
              ?? medianHeadwayInWindow(own, 900, 1140, 3)
              ?? sustainedMedianHeadwayInWindow(own, 360, 1320, 3);
      if (hwPlain != null) allStopHwPlain[stopId] = hwPlain;
      const middayPlain = medianHeadwayInWindow(forCrossMidnightWindow(own, PERIODS.midday.end), PERIODS.midday.start, PERIODS.midday.end, 3);
      if (middayPlain != null) allStopMiddayHwPlain[stopId] = middayPlain;
      if (hw != null && usedOwnFallback) ownFallbackHw.add(stopId);
      const byPeriod: Partial<Record<PeriodKey, number>> = {};
      for (const [pk, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
        const pooledPh = isPooled ? pooledHeadwayInWindow(times, start, end, 3, false, own) : null;
        const ph = isPooled
          ? (pooledPh ?? medianHeadwayInWindow(forCrossMidnightWindow(own, end), start, end, 3, true))
          : medianHeadwayInWindow(forCrossMidnightWindow(times, end), start, end, 3, true);
        if (isPooled && pooledPh == null && ph != null) {
          const set = ownFallbackPeriodHw.get(stopId) ?? new Set<PeriodKey>();
          set.add(pk);
          ownFallbackPeriodHw.set(stopId, set);
        }
        if (ph != null) byPeriod[pk] = ph;
      }
      // The max gap, coverage and sustained flag describe the list the shown value came from:
      // the merged list where the pool published, the own pattern where it fell back.
      const fellBack = ownFallbackPeriodHw.get(stopId);
      const pickByPeriod = <T extends Partial<Record<PeriodKey, unknown>>>(merged: T, ownOnly: T): T => {
        if (!fellBack?.size) return merged;
        const out = { ...merged };
        for (const pk of fellBack) (out as Record<string, unknown>)[pk] = (ownOnly as Record<string, unknown>)[pk];
        return out;
      };
      allStopPeriodMaxGaps[stopId] = isPooled ? pickByPeriod(computePeriodMaxGaps(times), computePeriodMaxGaps(own)) : computePeriodMaxGaps(times);
      allStopPeriodCoverageHw[stopId] = isPooled ? pickByPeriod(computePeriodCoverageHeadways(times), computePeriodCoverageHeadways(own)) : computePeriodCoverageHeadways(times);
      if (Object.keys(byPeriod).length > 0) {
        allStopPeriodHw[stopId] = byPeriod;
        allStopPeriodSustained[stopId] = isPooled ? pickByPeriod(computePeriodSustained(times), computePeriodSustained(own)) : computePeriodSustained(times);
      }
      // Hourly: widen past a strict hour only when it doesn't already have >=3 departures on its
      // own, up to a 90-min window [h*60, h*60+90] so 30-min routes still show up (issue #282).
      const byHour: HeadwayByHour = {};
      for (const h of SPARKLINE_HOURS) {
        const hh = adaptiveMedianHeadwayInWindow(times, h * 60, 3);
        byHour[h] = hh;
      }
      allStopHourHw[stopId] = byHour;
    }
    // #690: the route-level fallbacks (all-stop median, branch detection, the minimum stop
    // headways the filter reads) keep reading the own pattern, so pooled stop values never
    // reach a route-level value by a side door. Only the pooled stops differ.
    const ownStopHw: Record<string, number> = { ...allStopHw };
    const ownStopPeriodHw: Record<string, Partial<Record<PeriodKey, number>>> = { ...allStopPeriodHw };
    for (const stopId of pooled?.pooledStops ?? []) {
      const own = [...(metricStopMap.get(stopId) ?? [])].sort((a, b) => a - b);
      const hw = medianHeadwayInWindow(own, 540, 900, 3, true)
        ?? medianHeadwayInWindow(own, 900, 1140, 3, true)
        ?? sustainedMedianHeadwayInWindow(own, 360, 1320, 3, undefined, true);
      if (hw != null) ownStopHw[stopId] = hw; else delete ownStopHw[stopId];
      const byPeriod: Partial<Record<PeriodKey, number>> = {};
      for (const [pk, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
        const ph = medianHeadwayInWindow(forCrossMidnightWindow(own, end), start, end, 3, true);
        if (ph != null) byPeriod[pk] = ph;
      }
      if (Object.keys(byPeriod).length > 0) ownStopPeriodHw[stopId] = byPeriod; else delete ownStopPeriodHw[stopId];
    }
    // Coverage needs only one departure, so publish it before the legacy median bail-outs.
    // Project separately to keep historical stopOrder and geometry completely unchanged.
    const coverageStops = isMapless
      ? maplessStopProjection
      : projectStopsOntoShape([...metricStopMap.keys()], stopsById, shapePts).filter(p => p.dev2 <= MAX_STOP_DEV2);
    feature.properties.stopPeriodCoverageHeadways = Object.fromEntries(
      coverageStops.map(({ stopId }) => [stopId, allStopPeriodCoverageHw[stopId]]),
    );
    // #690: the line's destination pool at its terminal, the same branch-scoped sample #728
    // grades the tier on (the headsign's trips serving at least two thirds of the drawn stops
    // and every stop of the last third). When it has at least MIN_POOLED_TIER_DEPARTURES
    // departures and more than the own pattern, the headline and the period values read it,
    // so a same-destination service split over several shapes reads the whole service (RFTA L:
    // five hourly shapes, every 30 combined). A pool that adds nothing leaves the own pattern,
    // and a different branch joining for the last stops never qualifies (it misses the drawn
    // stops), so the headline never reads a shared terminal's combined frequency.
    const pooledHeadlineTimes = (terminalId: string | undefined): number[] | null => {
      if (railFeature || !featureHeadsign || !terminalId || coverageStops.length < 2) return null;
      if (feature.properties.serviceClass === 'irregular' || feature.properties.tier === 'span') return null;
      const own = new Set(metricStopMap.get(terminalId) ?? []).size;
      const pool = branchTerminalTimes(`${shortName}::${dirId}::${day}::${featureHeadsign}`, coverageStops.map(p => p.stopId), terminalId, true);
      const n = new Set(pool).size;
      if (n < MIN_POOLED_TIER_DEPARTURES || n <= own) return null;
      // The pool must be all-day service with daytime departures of its own (the same guard as
      // the thin-shape rescue), so a night route's pre-dawn pieces never pool into a headline.
      const sorted = [...pool].sort((a, b) => a - b);
      if (!scopedTerminalHeadline(sorted, day as DayType, featureRoute?.route_type ?? '', railFeature)) return null;
      // And even enough to read as one service (pooledHeadwayInWindow's guard): two branches
      // bunched 3 minutes apart keep the own pattern's headline.
      return pooledStepOneHeadway(sorted, [...(metricStopMap.get(terminalId) ?? [])]) != null ? sorted : null;
    };
    // #771: the drawn non-terminal stops served by fewer distinct departures than the destination
    // pool: stops some variants skip (MTA Silver's Morgan State stops, a branch's own tail). A
    // stop every pooled trip serves reads the same trips in a shifted clock window (basin 1
    // Saturday: 60/120 alternation reads 120 at the first stops and 80 further on), so it adds
    // nothing and is left out. Every stop of the drawn pattern counts, with or without an all-day
    // value (Step 2 keeps only valued stops): a peak-only outer tail is the worst of the line.
    let drawnPatternStopsMemo: Array<{ stopId: string; t: number }> | null = null;
    const drawnPatternStops = (): Array<{ stopId: string; t: number }> => drawnPatternStopsMemo ??= isMapless
      ? maplessStopProjection
      : projectStopsOntoShape([...stopMetricMap.keys()], stopsById, shapePts).filter(p => p.dev2 <= MAX_STOP_DEV2);
    // A drawn stop has a real all-day reading when its list has at least
    // MIN_ALL_DAY_TERMINAL_DEPARTURES unique departures over 6-22h: the thin-shape rescue's
    // count, without its burst, window or sustained-median requirements, so a peak-only commuter
    // line (actransit W weekday, six AM trips in 90 minutes) and a peak-heavy line with a midday
    // hole (ttc 100 via Linkwood) still read. Without one the stop is drawn limited and
    // left out of the headline and the period floors (CIV-150: cta J14 Saturday read 455 from a
    // two-trip tail under segments every 10; nine lines lost their headline to one such stop).
    const stopHasReading = (stopId: string): boolean => {
      const sorted = [...new Set(stopMetricMap.get(stopId) ?? [])].sort((a, b) => a - b);
      const daytime = sorted.filter(t => t >= 360 && t <= 1320);
      return daytime.length >= MIN_ALL_DAY_TERMINAL_DEPARTURES;
    };
    // The line runs by day when at least half of its stop departures fall in 6-22h; a night
    // route (actransit 800 Sunday) keeps its overnight headline and is never "limited" here.
    const lineRunsByDay = (): boolean => {
      let deps = 0, daytime = 0;
      for (const times of stopMetricMap.values()) { deps += times.length; daytime += times.filter(t => t >= 360 && t <= 1320).length; }
      return daytime * 2 >= deps;
    };
    const servedByFewerTrips = (pool: readonly number[] | null): string[] => {
      if (!pool) return [];
      const poolCount = new Set(pool).size;
      return drawnPatternStops().slice(0, -1).map(p => p.stopId).filter(stopId => new Set(stopMetricMap.get(stopId) ?? []).size < poolCount);
    };
    // Steps 2-3 and the line's segments (#690), shared by the thin-own-sample path below and
    // the full path: stop data is published from the pooled values whenever any stop has one.
    const publishStopData = (): { onShape: typeof coverageStops; stopHeadways: Record<string, number> } | null => {
      // Step 2: project all stops onto this feature's specific shape, then filter to stops
      // within MAX_STOP_DEV_DEG of the shape (excludes stops from other headsign branches).
      const allProjected = isMapless
        ? maplessStopProjection.filter(p => allStopHw[p.stopId] != null)
        : projectStopsOntoShape(Object.keys(allStopHw), stopsById, shapePts);
      const onShape = isMapless ? allProjected : allProjected.filter(p => p.dev2 <= MAX_STOP_DEV2);

      if (onShape.length > 1) {
        feature.properties.stopOrder = onShape.map(p => p.stopId);
        feature.properties.stopPositions = onShape.map(p => Math.round(p.t * 10000) / 10000);
      }

      // Step 3: build stopHeadways from on-shape stops only.
      const stopHeadways: Record<string, number> = {};
      for (const { stopId } of onShape) {
        if (allStopHw[stopId] != null) stopHeadways[stopId] = allStopHw[stopId];
      }
      if (Object.keys(stopHeadways).length === 0) return null;
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
      // #690: cut the drawn line into segments graded by what serves each stop: the every-gap
      // grade of the stop's (pooled) departures, never better than its stop headway implies. A
      // trunk every 8 shared by two branches every 16 reads one segment at 10-15 and tails at 20.
      // Every stop of the drawn pattern is cut in, not only the valued stops above: a stop with
      // no all-day value shows the limited-service styling along its stretch, so a peak-only
      // outer tail never carries the trunk's pooled colour (#810). Limited is relative to the
      // line's own day: on a line that runs mostly outside the 6-22h window (TTC 320 Yonge reads
      // every 7 overnight; 354 Starspray's last trips end after 06:00) no stop has a daytime
      // reading to be limited, so a valueless stop has no reading here and joins its
      // neighbours; on a daytime line a tail its few trips reach before dawn is limited. The
      // line's day is read from the stop lists it publishes (pooled where #690 pools them): TTC
      // 24 to Steeles is drawn on a 4-trip pre-dawn shape but its stops read the daytime pool,
      // so the 3 origin stops only those 4 trips serve are limited.
      if (!isMapless && drawnPatternStops().length > 1) {
        const runsByDay = lineRunsByDay();
        const segments = segmentsByTier(drawnPatternStops(), stopId => {
          const times = stopMetricMap.get(stopId);
          if (!times || times.length === 0) return null;
          // The same all-day rule as the headline (stopHasReading), on the same list the stop's
          // value was read from: a stop that fails it has no all-day reading and is limited (ttc
          // 17 weekday Steeles via Wintermute: a tail its own trips reach once at midday graded
          // 30 on that one departure).
          const graded = scopedTerminalHeadline(times, day as DayType, featureRoute?.route_type ?? '', railFeature);
          const headway = stopHasReading(stopId) ? allStopHw[stopId] ?? null : null;
          if (headway == null && !runsByDay) return null;
          return { tier: graded?.tier ?? null, headway };
        });
        if (segments.length > 0) feature.properties.segments = segments;
      }
      return { onShape, stopHeadways };
    };

    if (Object.keys(ownStopHw).length === 0) {
      // No stop gets a headway from this feature's own sample, so Step 4 below never runs and
      // the phase 2 value of the shape that won dedupe would stand. ttc 35A (Mount Dennis) is
      // drawn on shape 1122587, 4 trips 05:12-05:41: headline 12 and no period values for a
      // branch that runs about every 15 (79 trips at Mount Dennis, 6-22h median 15). Apply Step
      // 4's thin-terminal rule here: same guard, same scoped headline, tier only degrades.
      const terminalId = coverageStops.at(-1)?.stopId;
      let rescued = false;
      if (feature.properties.serviceClass !== 'irregular' && feature.properties.tier !== 'span'
        && feature.properties.headway != null && terminalId != null
        && isThinAllDayTerminalSample(metricStopMap.get(terminalId) ?? [], featureBranchTripCount.get(feature) ?? 0)) {
        const scoped = terminalId
          ? scopedTerminalHeadline(
            featureHeadsign && coverageStops.length > 1
              ? branchTerminalTimes(`${shortName}::${dirId}::${day}::${featureHeadsign}`, coverageStops.map(p => p.stopId), terminalId)
              : selectTerminalDepartureTimes(shapeMap?.get(terminalId), headsignMap?.get(terminalId)),
            day as DayType,
            featureRoute?.route_type ?? '',
            railFeature,
          )
          : null;
        if (scoped) {
          feature.properties.headway = scoped.headway;
          const newTier = headwayToTier(scoped.headway);
          if ((TIER_RANK[newTier] ?? -1) > (TIER_RANK[feature.properties.tier as string] ?? -1)) {
            feature.properties.tier = newTier;
          }
          rescued = true;
        }
      }
      // Pooled stop values can still describe the stops the thin shape serves (#690).
      publishStopData();
      // Without a rescue the phase 2 value of a two- or three-trip shape would stand as the
      // headline (cta J14 Saturday: a 32-stop shape run by two trips past a trunk every 10 read
      // 455). On a daytime line the headline is the worst pooled reading among the drawn stops
      // that have one, and a line with none is limited (CIV-150).
      if (!rescued && !railFeature && !isMapless && lineRunsByDay()
        && feature.properties.serviceClass !== 'irregular' && feature.properties.tier !== 'span') {
        const reading = drawnPatternStops().filter(p => stopHasReading(p.stopId));
        const vals = reading.map(p => allStopHw[p.stopId]).filter((v): v is number => v != null);
        if (vals.length) {
          const headway = Math.max(...vals);
          feature.properties.headway = headway;
          const newTier = headwayToTier(headway);
          if ((TIER_RANK[newTier] ?? -1) > (TIER_RANK[feature.properties.tier as string] ?? -1)) feature.properties.tier = newTier;
        } else if (!reading.length) {
          feature.properties.headway = null;
        }
        // Stops with a reading but no published value (saint-john 12: six trips whose all-day
        // sample rejects its 4-hour holes) keep phase 2's own headline.
      }
      continue;
    }

    const published = publishStopData();
    if (!published) continue;
    const { onShape, stopHeadways } = published;


    // Step 4: override feature headway + tier using the terminal stop's headway.
    // "to Niagara Falls GO every 15 min" is wrong — that's trunk frequency, not branch frequency.
    // Only trips that reach the terminal stop contribute to its headway, so it correctly reflects
    // how often service actually goes there. Falls back to all-stop median if terminal has no data.
    //
    // Headline period uses trip-dispatch midday when that's denser than times-at-terminus-in-window:
    // long trip runtimes drop late-midday departures from the terminal clock window (GO 94).
    if (feature.properties.serviceClass !== 'irregular' && feature.properties.tier !== 'span') {
      const terminalId = onShape[onShape.length - 1]?.stopId;
      // The headline reads the own pattern at the terminal (allStopHw may hold a pooled value
      // there, #690) or the qualifying destination pool.
      const ownTerminalTimes = (terminalId ? metricStopMap.get(terminalId) : undefined) ?? [];
      const headlinePool = pooledHeadlineTimes(terminalId);
      const hwVals = onShape.map(({ stopId }) => ownStopHw[stopId]).filter((v): v is number => v != null).sort((a, b) => a - b);
      // Step 4.1 (routeGrading.ts): the terminal's value, from the pool or the own pattern.
      const { ownTerminalMiddayHw, terminalHw, terminalMiddayHw, allStopMedian, poolUsed, terminalComputedHw } = terminalReading({ terminalId, ownTerminalTimes, pool: headlinePool, ownStopHwsSorted: hwVals });

      // If the terminal stop is shared, the combined terminal headway might be lower (better)
      // than the branch-specific headway. Do not override with the combined headway in that case.
      // Only override/degrade to the terminal headway if it is less frequent (higher) than branch
      // headway — unless branchHw itself is too thinly sampled to trust (issue #263: a sparse
      // branch's own median can be noisy/stale, wrongly blocking a real improvement), or unless
      // there's no genuine branch here to protect in the first place (issue #263 follow-up: a
      // flat route has no trunk/branch split, so branchHw vs. terminalComputedHw is just two
      // statistics of one uniform service, not a real protection scenario).
      const branchHw = feature.properties.headway as number | null;
      const branchTripCount = featureBranchTripCount.get(feature) ?? 0;
      // A terminal value from the all-day fallback window on fewer than four departures is a
      // two-gap mean, not a headway: keep the phase 2 branch value (metrolink Riverside, #733).
      const thinTerminalSample = branchHw != null
        && ownTerminalMiddayHw == null
        && terminalHw != null
        && isThinAllDayTerminalSample(metricStopMap.get(terminalId!) ?? [], branchTripCount);
      // That branch value can itself rest on a thin shape that won feature dedupe: ttc 35B
      // (Mount Dennis via Hullmar) is drawn on shape 1122586, 5 trips 05:03-05:44 whose own
      // median (10) over-claims a branch that runs about every 15 (6-22h at Mount Dennis, 77
      // trips). When the branch-scoped terminal sample Step 5 reads (the headsign's departures
      // at this terminal) has daytime service of its own (midday or PM peak), read the same
      // all-day window on it instead, and its tier (see scopedTerminalHeadline). Without
      // daytime service the branch value stands, so a night route's early-morning trips never
      // become its headline (ttc 329 and 334 Sunday would go from 30 to 20 and 23).
      const scoped = thinTerminalSample
        ? scopedTerminalHeadline(
          featureHeadsign && coverageStops.length > 1
            ? branchTerminalTimes(`${shortName}::${dirId}::${day}::${featureHeadsign}`, coverageStops.map(p => p.stopId), terminalId!)
            : selectTerminalDepartureTimes(shapeMap?.get(terminalId!), headsignMap?.get(terminalId!)),
          day as DayType,
          featureRoute?.route_type ?? '',
          railFeature,
        )
        : null;
      // The branch decision runs on plain medians (resolveTerminalHeadline, #772).
      const plainStopHws = Object.keys(stopHeadways).map(id => allStopHwPlain[id]).filter((v): v is number => v != null).sort((a, b) => a - b);
      const plainMid = Math.floor(plainStopHws.length / 2);
      const plainAllStopMedian = plainStopHws.length === 0 ? allStopMedian
        : plainStopHws.length % 2 === 0 ? Math.round((plainStopHws[plainMid - 1] + plainStopHws[plainMid]) / 2) : plainStopHws[plainMid];
      const plainTerminalComputedHw = (terminalId ? allStopMiddayHwPlain[terminalId] ?? allStopHwPlain[terminalId] : undefined)
        ?? plainAllStopMedian;
      const plainNonTerminalStopHws = onShape.slice(0, -1)
        .map(({ stopId }) => allStopHwPlain[stopId])
        .filter((v): v is number => v != null);
      // #771: the drawn stops some pooled variants skip (MTA Silver to Curtis Bay: the Morgan
      // State stops before the Hopkins short trips join run every 40 in the evening against 20
      // combined), read where #690 pools them; the terminal itself is read from the pool already
      // (freedom M to Pittsburgh: the drawn variant's own terminal is a stop 3 of 10 trips end at).
      // A drawn stop has a real all-day reading when its list passes the same rule as the
      // segments and the thin-shape rescue (scopedTerminalHeadline: a daytime window of three
      // departures, four over 6-22h, spread past a burst). A stop without one is drawn limited
      // and left out of the headline (CIV-150: cta J14 Saturday read 455 from a two-trip tail
      // under segments every 10; nine lines read no headline at all for one such stop).
      const worstDrawnStopHw = (): number | undefined => {
        const vals = servedByFewerTrips(headlinePool)
          .filter(stopId => !ownFallbackHw.has(stopId) && stopHasReading(stopId))
          .map(stopId => allStopHw[stopId])
          .filter((v): v is number => v != null);
        return vals.length ? Math.max(...vals) : undefined;
      };
      // No drawn stop with a real all-day reading, the terminal included: the line is limited and
      // has no all-day headline (translink 6727 weekday, pace 807 weekday read 227 and 321 from a
      // terminal's sparse all-day fallback while every segment was limited).
      const readingStops = railFeature || isMapless ? [] : drawnPatternStops().filter(p => stopHasReading(p.stopId));
      const terminalHasReading = !terminalId || stopHasReading(terminalId);
      const lineHasReading = railFeature || isMapless || !terminalId || !lineRunsByDay() || poolUsed || scoped != null
        || terminalHasReading || readingStops.length > 0;
      // A terminal with no all-day reading on a line whose other drawn stops have one (cta J14
      // Saturday: a 32-stop shape run by two trips past a trunk every 10): the headline is the
      // worst reading among those stops, not the thin shape's own value (455).
      const worstReadingStop = (): number | undefined => {
        const vals = readingStops.map(p => allStopHw[p.stopId]).filter((v): v is number => v != null);
        return vals.length ? Math.max(...vals) : undefined;
      };
      // Step 4.2 and 4.3 (routeGrading.ts): the headline, then the tier it supports.
      // A midday value read off three uneven departures is a two-gap mean (wsf 131 Anacortes,
      // 205 and 100 read 153): keep the phase 2 branch value, as for a thin all-day sample (#745).
      const unevenMiddayTerminal = !poolUsed
        && branchHw != null
        && terminalMiddayHw != null
        && isUnevenTwoGapMiddayTerminalSample(metricStopMap.get(terminalId!) ?? [], branchTripCount);
      const headway = !lineHasReading ? null
        : (!terminalHasReading && !poolUsed && scoped == null && lineRunsByDay() && worstReadingStop() != null) ? worstReadingStop()!
        : decideHeadline({
        unevenMiddayTerminal,
        branchHw,
        branchTripCount,
        terminalComputedHw,
        hasPool: poolUsed,
        thinTerminalSample,
        scoped,
        worstDrawnStopHw: poolUsed ? worstDrawnStopHw() : undefined,
        plainTerminalComputedHw,
        plainNonTerminalStopHws,
        pooledPlainTerminalHw: pooledTerminalHeadway(terminalId ? headsignMap?.get(terminalId) : undefined),
      });
      feature.properties.headway = headway;
      feature.properties.tier = settleTier(feature.properties.tier as string, headway, scoped);
      // #728: the tier is phase 2's every-gap grade of the one shape that won dedupe, while the
      // period values below read the whole destination at the terminal. A shape that covers part
      // of the day or has one hole is graded 60 or infrequent beside periods of 8-20 (Brampton 7
      // Kennedy South: the 7 shape has one 38-minute evening gap, the destination runs every 8). When the
      // destination's branch-scoped pool (the headsign's trips serving at least two thirds of
      // the drawn stops and every stop of the last third) has more unique departures at the
      // terminal than the shape and at least MIN_POOLED_TIER_DEPARTURES, grade that pool with
      // the same every-gap rule over the same window at every drawn stop (the same trips can
      // leave a longer gap at an earlier stop: guelph 19 Sunday, 31 minutes at one outer stop
      // against 25 at the terminal) and take the worst grade, never past what the headline
      // supports. A drawn stop at which the pool has no all-day grade (too few daytime departures,
      // or a daytime hole among the trips that serve it: the first stop of septa 2 Johnston, where
      // 50 of the 61 pool trips start and leave a 96-minute evening hole the other 11 fill further
      // in; rtcsnv 110 Eastern Northbound, a 121-minute hole at the first stop) refuses the lift:
      // the lifted tier would overstate that stop. Unique times only: phase 1 drops duplicate departures, and a
      // zero-minute gap would loosen the allowance (wsf 73: 161 trips, 23 distinct times). Rail
      // and irregular lines are left alone; nothing here changes a headway.
      if (!railFeature && featureHeadsign && coverageStops.length > 1 && terminalId
        && feature.properties.serviceClass !== 'irregular' && feature.properties.tier !== 'span' && headway != null) {
        const hsKey = `${shortName}::${dirId}::${day}::${featureHeadsign}`;
        const drawnIds = coverageStops.map(p => p.stopId);
        const shapeTerminalDepartures = new Set(shapeMap?.get(terminalId) ?? []).size;
        const poolDepartures = new Set(branchPoolTimesAt(hsKey, drawnIds, terminalId, true)).size;
        if (poolDepartures >= MIN_POOLED_TIER_DEPARTURES && poolDepartures > shapeTerminalDepartures) {
          // Step 4.4 (routeGrading.ts): the pool's worst every-gap grade over the drawn stops and
          // the other weekdays, never past the headline.
          feature.properties.tier = liftTierOnDestinationPool({
            currentTier: feature.properties.tier as string,
            headway,
            day: day as DayType,
            drawnStopIds: drawnIds,
            gradeAt: (stopId, weekday) => scopedTerminalHeadline(branchPoolTimesAt(hsKey, drawnIds, stopId, true, weekday), day as DayType, featureRoute?.route_type ?? '', railFeature)?.tier ?? null,
            otherWeekdays: () => otherWeekdayPools(hsKey),
          });
        }
      }
      // Minimum stop headway — the best frequency available anywhere on this route.
      // Used by passesRouteFilter so routes with high-frequency sections aren't excluded
      // even when the terminal headway doesn't meet the active threshold (pairs with AI-97 clipping).
      feature.properties.minStopHeadway = hwVals[0] ?? Object.values(stopHeadways).sort((a, b) => a - b)[0];
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
    const featHeadsign = feature.properties.headsign as string | null;
    const hsStopMap = featHeadsign
      ? stopDepsByHeadsignGroup.get(`${shortName}::${dirId}::${day}::${featHeadsign}`)
      : undefined;
    const headsignTerminalTimes = terminalStopId ? hsStopMap?.get(terminalStopId) : undefined;
    // Terminal-stop raw times are authoritative for the displayed period headway below, but
    // Night Service is a route-level departure test. The route endpoints are used so the window
    // edges are measured from dispatches, not arrivals that are shifted by the route's travel
    // time. Read directly from stop_times rather than result.times because feeds such as TTC
    // Line 1 can lose post-midnight departures during phase 1/2 analysis.
    const terminalRawTimes = (headsignTerminalTimes && headsignTerminalTimes.length > 0)
      ? headsignTerminalTimes
      : (terminalStopId ? metricStopMap.get(terminalStopId) : undefined);
    // Frequent Network (#294 follow-on): entirely within normal (non-extended-hour) GTFS notation,
    // so unlike Night Service this needs no service_id union across the midnight boundary --
    // terminalRawTimes alone is the right input. Weekday only, per docs/research/frequent-service-research-2026-09/CRITERIA.md.
    feature.properties.frequentService = (day === 'Weekday' && terminalRawTimes)
      ? hasSustainedFrequentService(terminalRawTimes)
      : false;
    feature.properties.researchFrequentService = terminalRawTimes
      ? computeResearchFrequentService(terminalRawTimes)
      : { daytime15: false, daytime30: false, extended15: false, extended30: false };
    // #690: the period values read the same destination pool as the headline when it qualifies.
    const periodPoolTimes = pooledHeadlineTimes(terminalStopId);
    const periodsFromPool = periodPoolTimes != null;
    const terminalScopedTimes = periodPoolTimes ?? (railFeature
      ? (headsignTerminalTimes ?? (terminalStopId ? shapeMap?.get(terminalStopId) : undefined))
      : selectTerminalDepartureTimes(
        terminalStopId ? shapeMap?.get(terminalStopId) : undefined,
        headsignTerminalTimes,
      ));
    const headsignTerminalPeriodHw = terminalScopedTimes && terminalScopedTimes.length > 0
      ? computePeriodHeadways(terminalScopedTimes)
      : undefined;
    const headsignTerminalMaxGaps = terminalScopedTimes && terminalScopedTimes.length > 0
      ? computePeriodMaxGaps(terminalScopedTimes)
      : undefined;
    const headsignTerminalPeriodSustained = terminalScopedTimes && terminalScopedTimes.length > 0
      ? computePeriodSustained(terminalScopedTimes)
      : undefined;
    const terminalPeriodSustained = terminalStopId ? allStopPeriodSustained[terminalStopId] : undefined;
    const terminalPeriodMaxGaps = terminalStopId ? allStopPeriodMaxGaps[terminalStopId] : undefined;
    const terminalPeriodIsBranchScoped = !!headsignTerminalPeriodHw;
    // Select the time array before looking up a period: a scoped null is real no-service,
    // not permission to borrow departures from another branch at the same stop.
    const terminalCoverage = computePeriodCoverageHeadways(
      terminalScopedTimes ?? (terminalStopId ? metricStopMap.get(terminalStopId) : undefined) ?? [],
    );
    const branchCoverage = feature.properties.periodCoverageHeadway as HeadwayByPeriod;
    const periodCoverage: HeadwayByPeriod = {};
    const periodMedians: HeadwayByPeriod = {};
    const periodMaxGaps: HeadwayByPeriodMaxGap = {};
    const periodSustained: HeadwayByPeriodSustained = {};
    const periodMins: Partial<Record<PeriodKey, number>> = {};
    const branchPeriodHw = feature.properties.headwayByPeriod as HeadwayByPeriod | undefined;
    const branchPeriodMaxGaps = feature.properties.maxGapByPeriod as HeadwayByPeriodMaxGap | undefined;
    const branchPeriodSustained = feature.properties.headwayByPeriodSustained as HeadwayByPeriodSustained | undefined;
    for (const pk of Object.keys(PERIODS) as PeriodKey[]) {
      const termH = headsignTerminalPeriodHw?.[pk] ?? terminalPeriodHw?.[pk] ?? null;
      // #771: the drawn stops some pooled variants skip, read where #690 pools them (see
      // worstDrawnStopHw in Step 4): the one with the worst value this period, with its own
      // companions. A stop with no value this period is left out, as the headline leaves out a
      // stop with no all-day reading (cambus 41 weekday Loop: midday every 20 at 18 departures
      // read no midday at all for one such stop). Null when the periods do not come from the pool.
      let worstDrawnStop: PeriodValue | null = null;
      if (periodsFromPool) {
        let worstStopId: string | null = null;
        for (const stopId of servedByFewerTrips(periodPoolTimes)) {
          if (ownFallbackPeriodHw.get(stopId)?.has(pk) || !stopHasReading(stopId)) continue;
          const h = allStopPeriodHw[stopId]?.[pk] ?? null;
          if (h == null) continue;
          if (worstStopId == null || h > (allStopPeriodHw[worstStopId]?.[pk] ?? -Infinity)) worstStopId = stopId;
        }
        if (worstStopId != null) {
          worstDrawnStop = {
            headway: allStopPeriodHw[worstStopId]?.[pk] ?? null,
            coverage: allStopPeriodCoverageHw[worstStopId]?.[pk] ?? null,
            maxGap: allStopPeriodMaxGaps[worstStopId]?.[pk] ?? null,
            sustained: allStopPeriodSustained[worstStopId]?.[pk],
          };
        }
      }
      // Step 5 (routeGrading.ts): the period's value and its companions.
      const period = decidePeriod({
        termH,
        branchH: branchPeriodHw?.[pk] ?? null,
        terminalIsBranchScoped: terminalPeriodIsBranchScoped,
        worstDrawnStop,
        terminalCoverage: terminalCoverage[pk] ?? null,
        branchCoverage: branchCoverage[pk] ?? null,
        hasScopedTimes: terminalScopedTimes != null,
        termMaxGap: headsignTerminalMaxGaps?.[pk] ?? terminalPeriodMaxGaps?.[pk] ?? null,
        branchMaxGap: branchPeriodMaxGaps?.[pk] ?? null,
        termSustained: headsignTerminalPeriodSustained?.[pk] ?? terminalPeriodSustained?.[pk],
        branchSustained: branchPeriodSustained?.[pk],
      });
      periodMedians[pk] = period.headway;
      periodCoverage[pk] = period.coverage;
      periodMaxGaps[pk] = period.maxGap;
      if (period.headway != null) periodSustained[pk] = period.sustained;
      const allVals = onShape
        .map(({ stopId }) => ownStopPeriodHw[stopId]?.[pk])
        .filter((v): v is number => v != null);
      if (allVals.length > 0) periodMins[pk] = Math.min(...allVals);
    }
    feature.properties.headwayByPeriod = periodMedians;
    feature.properties.periodCoverageHeadway = periodCoverage;
    feature.properties.maxGapByPeriod = periodMaxGaps;
    feature.properties.headwayByPeriodSustained = periodSustained;
    feature.properties.minStopHeadwayByPeriod = periodMins;


    // Headsign-scoped trunk minimums for route-card range display. minStopHeadwayByPeriod
    // stays route-wide (combined deps) so map filters still show routes when any section qualifies.
    if (hsStopMap) {
      const hsPeriodHw: Record<string, Partial<Record<PeriodKey, number>>> = {};
      for (const [stopId, times] of hsStopMap) {
        times.sort((a, b) => a - b);
        const byPeriod: Partial<Record<PeriodKey, number>> = {};
        for (const [pk, { start, end }] of Object.entries(PERIODS) as [PeriodKey, { start: number; end: number }][]) {
          const ph = medianHeadwayInWindow(forCrossMidnightWindow(times, end), start, end, 3);
          if (ph != null) byPeriod[pk] = ph;
        }
        if (Object.keys(byPeriod).length > 0) hsPeriodHw[stopId] = byPeriod;
      }
      const headsignPeriodMins: Partial<Record<PeriodKey, number>> = {};
      for (const pk of Object.keys(PERIODS) as PeriodKey[]) {
        const vals = onShape
          .map(({ stopId }) => hsPeriodHw[stopId]?.[pk])
          .filter((v): v is number => v != null);
        const minHw = headsignOverlapMinHeadway(vals, periodMedians[pk] ?? null);
        if (minHw != null) headsignPeriodMins[pk] = minHw;
      }
      if (Object.keys(headsignPeriodMins).length > 0) {
        feature.properties.headsignMinStopHeadwayByPeriod = headsignPeriodMins;
      }
    }

    // Hourly headways from terminal stop for the sparkline.
    const terminalHourHw = terminalStopId ? allStopHourHw[terminalStopId] : undefined;
    const headsignTerminalHourHw = terminalScopedTimes
      ? Object.fromEntries(
          SPARKLINE_HOURS.map(h => [h, adaptiveMedianHeadwayInWindow(terminalScopedTimes, h * 60, 3)]),
        ) as HeadwayByHour
      : undefined;
    const terminalHourGaps = terminalStopId
      ? computeHourMaxGaps(metricStopMap.get(terminalStopId) ?? [], SPARKLINE_HOURS)
      : undefined;
    const headsignTerminalHourGaps = terminalScopedTimes
      ? computeHourMaxGaps(terminalScopedTimes, SPARKLINE_HOURS)
      : undefined;
    const terminalHourIsBranchScoped = !!headsignTerminalHourHw;
    const branchHourHw = feature.properties.headwayByHour as HeadwayByHour | undefined;
    if (branchHourHw) {
      const mergedHourHw: HeadwayByHour = {};
      const branchHourGaps = feature.properties.maxGapByHour as Record<number, number | null> | undefined;
      const mergedHourGaps: Record<number, number | null> = {};
      for (const h of SPARKLINE_HOURS) {
        const termH = headsignTerminalHourHw?.[h] ?? terminalHourHw?.[h] ?? null;
        const bH = branchHourHw[h] ?? null;
        const resolvedH = resolveTerminalPeriodHeadway(termH, bH, terminalHourIsBranchScoped);
        mergedHourHw[h] = resolvedH;
        mergedHourGaps[h] = resolvedH === termH
          ? (headsignTerminalHourGaps?.[h] ?? terminalHourGaps?.[h] ?? null)
          : (branchHourGaps?.[h] ?? null);
      }
      feature.properties.headwayByHour = mergedHourHw;
      feature.properties.maxGapByHour = mergedHourGaps;
    } else if (terminalHourHw) {
      feature.properties.headwayByHour = terminalHourHw;
      feature.properties.maxGapByHour = headsignTerminalHourGaps ?? terminalHourGaps;
    }
  }

  annotateShortTurnVariants(features, shapes);
  stampWorstDirectionHeadways(features);
  stampRouteIrregularDirection(features);

  annotateSharedStretches(features, {
    memberOf: feature => {
      const slot = featureStopHeadwaySlots.get(feature);
      if (!slot) return null;
      const member = sharedPatternKey(
        feature.properties.routeId as string,
        feature.properties.headsign as string | null,
        featureShapeId.get(feature),
      );
      return member ? { poolKey: `${slot.shortName}::${slot.dirId}::${slot.day}`, memberKey: member } : null;
    },
    patterns: sharedPatternsOf,
    departures: stopDepsBySharedMember,
    stopsById,
    parentOf: childToParent,
    excluded: partialWeekdayFeatures,
  });

  // Combined frequency corridors (AI-17): overlapping routes (2+ sharing consecutive stop links)
  // get aggregate headway from the *union* of their departures. Reuse a matching route shape
  // between each shared stop pair so the overlay follows the street instead of drawing a
  // misleading straight stop-to-stop chord.
  //
  // Corridors are skipped for all-rail feeds (route_type=2): rail lines run on dedicated
  // single-operator corridors where combined frequency is not meaningful, and the stop-pair
  // chord geometry creates misleading straight-line visuals over the actual shaped route.
  const allRailFeed = (gtfs.routes ?? []).length > 0 &&
    (gtfs.routes ?? []).every(r => String(r.route_type) === '2');

  onStatus?.('Calculating combined corridors...');
  const corridorFeatures: GeoJsonFeature[] = [];
  if (!allRailFeed) {
  const dayTypes: DayType[] = [...DAY_TYPES];
  for (const d of dayTypes) {
    const dayCfg = DEFAULT_CRITERIA.dayTypes[d];
    if (!dayCfg) continue;
    const corrs = calculateCorridors(gtfs, d, dayCfg.timeWindow.start, dayCfg.timeWindow.end, refDate);
    for (const c of corrs) {
      const from = stopsById.get(c.stopA);
      const to = stopsById.get(c.stopB);
      if (!from || !to) continue;

      const corridorGeometry = features
        .filter(feature =>
          feature.geometry.type === 'LineString' &&
          feature.properties.day === d &&
          c.routeIds.includes(String(feature.properties.routeId)),
        )
        // A route can have multiple branches/shapes close to the same stops. Only use a
        // shape whose serialized stop order contains this exact consecutive link; otherwise
        // projecting the two stops onto an unrelated branch can draw the corridor off-road.
        .filter(feature => {
          const stopOrder = feature.properties.stopOrder as string[] | undefined;
          if (!stopOrder) return false;
          return stopOrder.some((stopId, i) =>
            stopId === c.stopA && stopOrder[i + 1] === c.stopB,
          );
        })
        .map(feature => {
          const stopOrder = feature.properties.stopOrder as string[];
          const stopPositions = feature.properties.stopPositions as number[] | undefined;
          const pairIndex = stopOrder.findIndex((stopId, i) =>
            stopId === c.stopA && stopOrder[i + 1] === c.stopB,
          );
          if (pairIndex < 0) return null;
          if (stopPositions && stopPositions.length === stopOrder.length) {
            return clipLineBetweenPositions(
              feature.geometry.coordinates as number[][],
              stopPositions[pairIndex],
              stopPositions[pairIndex + 1],
            );
          }
          return clipLineBetweenStops(feature.geometry.coordinates as number[][], from, to);
        })
        .find((geometry): geometry is number[][] => geometry != null);
      // A corridor without a matching shaped route is safer to omit than to render as a
      // straight line through places where no vehicle travels.
      if (!corridorGeometry) continue;

      const h = Math.round(c.avgHeadway);
      const shortNames = c.routeIds
        .map((rid: string) => routeById.get(rid)?.route_short_name ?? rid)
        .filter(Boolean);
      corridorFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: corridorGeometry,
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
  const allCoords = features.flatMap(f =>
    f.geometry.type === 'LineString' ? f.geometry.coordinates : [f.geometry.coordinates],
  );
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
  const calendarExpiry = effectiveFeedExpiry({
    feedInfoEnd: feedInfo?.feed_end_date,
    calendarEnds: gtfs.calendar?.map(calendar => calendar.end_date) ?? [],
    calendarDates: gtfs.calendarDates,
  });
  const timezone = gtfs.agencies?.[0]?.agency_timezone?.trim() || null;
  // Scheduled running time (CIV-84): card data in its own top-level block of the agency JSON,
  // beside the features, so route features and map tiles are untouched.
  const runningTimes = computeRunningTimes(gtfs, routeById, activeServiceIdsByCalendarDay, shapeFilterForPhase1);

  const mainFeatures = [...features, ...stopFeatures];
  const routeFeatures = features.filter(feature =>
    feature.properties.routeShortName != null,
  );
  const routeHeadwayMismatches = routeFeatures.filter(feature => {
    const headway = Number(feature.properties.headway);
    const minStopHeadway = Number(feature.properties.minStopHeadway);
    return Number.isFinite(headway) && Number.isFinite(minStopHeadway) && minStopHeadway > 0 && headway >= minStopHeadway * 1.8;
  }).length;
  const feedQuality = assessFeedQuality({
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    shapeAnomalies: gtfs.shapeAnomalies?.length ?? 0,
    routeHeadwayMismatches,
    featureCount: routeFeatures.length,
    // Same rule as the registry's lastFeedExpiry, so a stale feed_info end date
    // does not mark a feed whose calendar runs on as expired (#687).
    feedExpiry: recordedFeedExpiry(feedInfo?.feed_end_date ?? null, calendarExpiry, new Date().toISOString().slice(0, 10)),
  });

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
    geojson: JSON.stringify({ type: 'FeatureCollection', atlasSchemaVersion: ROUTE_ARTIFACT_SCHEMA_VERSION, features: mainFeatures, runningTimes: runningTimesJson(runningTimes) }),
    corridorsGeojson: JSON.stringify({ type: 'FeatureCollection', features: corridorFeatures }),
    stopsJson: JSON.stringify(stopsIndex),
    tripsJson: JSON.stringify(tripsLookup),
    stopsMetaJson: JSON.stringify(stopsMeta),
    featureCount: mainFeatures.length,
    center,
    timezone,
    feedExpiry: feedInfo?.feed_end_date ?? null,
    calendarExpiry,
    feedVersion: feedInfo?.feed_version ?? null,
    livePollingSidecar,
    shapeAnomalies: gtfs.shapeAnomalies,
    feedQuality,
  };
}
