/**
 * Scheduled running time per route, direction and day type (CIV-84): how long the main pattern's
 * full end-to-end trips take, from the first stop's departure to the last stop's arrival, by hour
 * of departure and by Atlas period. Additive data for the route card; never in map tiles.
 *
 * Fail closed: only the main pattern counts (the shapes the headway filter analyses, between their
 * two terminals, one stop pattern), and an hour or period with fewer than two trips is left out
 * rather than guessed. Loops (start and end at the same stop or station) are measured as a full
 * loop and flagged, never halved.
 */
import type { DayName, GtfsData, GtfsRoute } from '../types/gtfs.js';
import { SPARKLINE_HOURS, TIME_PERIODS, type PeriodKey } from '../shared/config.js';
import { expandTripFrequencyWindows, parseFrequencyWindow, t2m, type FrequencyWindow } from './transit-utils.js';
import { pickRepresentativeWeekday } from './representativeWeekday.js';

export type RunningTimeDayType = 'Weekday' | 'Saturday' | 'Sunday';

export interface RunningTimeRange {
  median: number;
  min: number;
  max: number;
}

export interface RunningTimeSummary {
  /** Median scheduled minutes for trips departing in each sparkline hour (GTFS hour, 6..28 and 5). */
  byHour: Record<string, number>;
  byPeriod: Partial<Record<PeriodKey, RunningTimeRange>>;
  /** The pattern starts and ends at the same place, so every value is one full loop. */
  loop?: true;
}

const WEEKDAY_NAMES: readonly DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MIN_TRIPS = 2;
/** A scheduled trip longer than this is treated as bad data, not a real run. */
const MAX_TRIP_MINUTES = 600;

interface TripRun {
  /** Direction as route features carry it (blank becomes '0', as in phase 1). */
  dirId: string;
  /** Route and direction as shape selection keys its analysis shapes (blank stays blank). */
  shapeDirKey: string;
  routeId: string;
  serviceId: string;
  shapeId: string | null;
  from: string;
  to: string;
  stops: number;
  /** Order-independent signature of the trip's stop set, so express and local runs split. */
  pattern: string;
  start: number;
  minutes: number;
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hashStop(stopId: string): number {
  let h = 2166136261;
  for (let i = 0; i < stopId.length; i++) h = Math.imul(h ^ stopId.charCodeAt(i), 16777619);
  return h >>> 0;
}

function summarize(runs: readonly TripRun[], loop: boolean): RunningTimeSummary | null {
  // One run per departure minute. Every run here shares one stop pattern, so a repeat is the same
  // trip under overlapping service_ids, not a different variant.
  const byStart = new Map<number, number>();
  for (const run of runs) if (!byStart.has(run.start)) byStart.set(run.start, run.minutes);
  const deps = [...byStart.entries()];
  const byHour: Record<string, number> = {};
  for (const hour of SPARKLINE_HOURS) {
    const mins = deps.filter(([start]) => Math.floor(start / 60) === hour).map(([, m]) => m).sort((a, b) => a - b);
    if (mins.length >= MIN_TRIPS) byHour[String(hour)] = Math.round(median(mins));
  }
  const byPeriod: Partial<Record<PeriodKey, RunningTimeRange>> = {};
  for (const { key, startHour, endHour } of TIME_PERIODS) {
    const mins = deps.filter(([start]) => start >= startHour * 60 && start < endHour * 60).map(([, m]) => m).sort((a, b) => a - b);
    if (mins.length >= MIN_TRIPS) byPeriod[key] = { median: Math.round(median(mins)), min: mins[0], max: mins[mins.length - 1] };
  }
  if (Object.keys(byHour).length === 0 && Object.keys(byPeriod).length === 0) return null;
  return { byHour, byPeriod, ...(loop ? { loop: true as const } : {}) };
}

function dominant<T>(items: readonly T[], keyOf: (item: T) => string): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function typicalStops(runs: readonly TripRun[]): number {
  return median(runs.map(r => r.stops).sort((a, b) => a - b));
}

/**
 * Running time keyed `${routeId}::${directionId}::${dayType}`. `analysisShapes` is the shape
 * filter phase 1 uses (`route::dir` keys); routes without an entry (rail) use their dominant shape.
 */
/** Share of a direction's trips that must reach a stop count for it to count as the longest regular trip. */
const MIN_LONG_SHARE = 0.1;

export function computeRunningTimes(
  gtfs: GtfsData,
  routeById: ReadonlyMap<string, GtfsRoute>,
  activeServiceIdsByCalendarDay: ReadonlyMap<DayName, ReadonlySet<string>>,
  analysisShapes: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, RunningTimeSummary> {
  const activeAnyDay = new Set<string>();
  for (const ids of activeServiceIdsByCalendarDay.values()) for (const id of ids) activeAnyDay.add(id);
  const tripById = new Map((gtfs.trips ?? [])
    .filter(t => activeAnyDay.has(t.service_id) && routeById.has(t.route_id))
    .map(t => [t.trip_id, t]));
  const parentOf = new Map((gtfs.stops ?? []).filter(s => s.parent_station).map(s => [s.stop_id, s.parent_station!]));
  const place = (stopId: string) => parentOf.get(stopId) ?? stopId;

  // One pass over stop_times: first departure, last arrival, stop count and stop-set signature.
  const first = new Map<string, { seq: number; stop: string; time: number | null }>();
  const last = new Map<string, { seq: number; stop: string; time: number | null }>();
  const stopCount = new Map<string, number>();
  const signature = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!tripById.has(st.trip_id)) continue;
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    stopCount.set(st.trip_id, (stopCount.get(st.trip_id) ?? 0) + 1);
    signature.set(st.trip_id, ((signature.get(st.trip_id) ?? 0) + hashStop(place(st.stop_id))) % 4294967296);
    const f = first.get(st.trip_id);
    if (!f || seq < f.seq) first.set(st.trip_id, { seq, stop: st.stop_id, time: t2m(st.departure_time) ?? t2m(st.arrival_time) });
    const l = last.get(st.trip_id);
    if (!l || seq > l.seq) last.set(st.trip_id, { seq, stop: st.stop_id, time: t2m(st.arrival_time) ?? t2m(st.departure_time) });
  }

  // Frequency-based trips: parsed and expanded with the shared rules (#702, #706), so one-trip
  // TransLoc-style rows don't invent departures; the template's duration applies to each one.
  const windowsByTrip = new Map<string, FrequencyWindow[]>();
  for (const freq of gtfs.frequencies ?? []) {
    const window = parseFrequencyWindow(freq);
    if (!window || !tripById.has(freq.trip_id)) continue;
    const list = windowsByTrip.get(freq.trip_id) ?? [];
    list.push(window);
    windowsByTrip.set(freq.trip_id, list);
  }

  const runs: TripRun[] = [];
  for (const [tripId, trip] of tripById) {
    const f = first.get(tripId), l = last.get(tripId);
    // Missing or impossible times are dropped, never patched.
    if (!f || !l || f.time === null || l.time === null) continue;
    const minutes = l.time - f.time;
    if (!(minutes > 0) || minutes > MAX_TRIP_MINUTES) continue;
    const stops = stopCount.get(tripId) ?? 0;
    const base = {
      routeId: trip.route_id,
      dirId: trip.direction_id?.trim() || '0',
      shapeDirKey: `${trip.route_id}::${trip.direction_id ?? '0'}`,
      serviceId: trip.service_id,
      shapeId: trip.shape_id || null,
      from: place(f.stop),
      to: place(l.stop),
      stops,
      pattern: `${stops}:${signature.get(tripId)}`,
      minutes,
    };
    const windows = windowsByTrip.get(tripId);
    if (windows) {
      for (const start of expandTripFrequencyWindows(windows, minutes)) runs.push({ ...base, start: Math.round(start) });
    } else {
      runs.push({ ...base, start: f.time });
    }
  }

  const byRouteDir = new Map<string, TripRun[]>();
  for (const run of runs) {
    const key = `${run.routeId}::${run.dirId}`;
    const list = byRouteDir.get(key) ?? [];
    list.push(run);
    byRouteDir.set(key, list);
  }

  const out = new Map<string, RunningTimeSummary>();
  for (const [key, list] of byRouteDir) {
    // Main pattern: the analysis shapes (looked up with shape selection's own direction key, which
    // keeps a blank direction blank), or, without a filter, the busiest shape.
    let shapes: ReadonlySet<string> | undefined;
    for (const run of list) shapes = shapes ?? analysisShapes.get(run.shapeDirKey);
    if (!shapes) {
      const top = dominant(list.filter(r => r.shapeId), r => r.shapeId!);
      shapes = top ? new Set([top]) : undefined;
    }
    const onShapes = shapes ? list.filter(run => run.shapeId && shapes!.has(run.shapeId)) : list;
    // Very short trips never set the pattern. Two-stop trips are set aside whenever the direction has
    // longer trips (a route whose every trip has two stops, like a ferry, keeps them), and so are
    // shuttles under a quarter of the direction's longest regular trip (TTC 52's short trips beside
    // 60-stop runs). The longest regular trip is the longest stop count that at least
    // MIN_LONG_SHARE of the direction's trips (and at least 2) reach, so one long interlined trip
    // can't set it. Then trips under half the main pattern's typical (median) stop count drop out.
    // If the analysis shapes hold no full-length trips, the direction's are used.
    const hasLonger = list.some(run => run.stops >= 3);
    const reach = Math.max(2, Math.ceil(list.length * MIN_LONG_SHARE));
    const byLength = list.map(r => r.stops).sort((a, b) => b - a);
    const longest = byLength[Math.min(reach, byLength.length) - 1];
    const notShuttle = (run: TripRun) => (!hasLonger || run.stops >= 3) && run.stops >= longest / 4;
    const pick = (pool: TripRun[]) => {
      const real = pool.filter(notShuttle);
      return real.length > 0 ? real.filter(run => run.stops >= typicalStops(real) / 2) : [];
    };
    let candidates = pick(onShapes);
    if (candidates.length === 0) candidates = pick(list);
    // Between the pattern's own two terminals, on one stop pattern: short turns, partial trips and
    // express runs between the same terminals drop out instead of blending into the median.
    const pair = dominant(candidates, run => `${run.from}>${run.to}`);
    if (!pair) continue;
    const onPair = candidates.filter(run => `${run.from}>${run.to}` === pair);
    const pattern = dominant(onPair, run => run.pattern);
    // Every trip of the direction on that terminal pair and stop pattern counts, whatever its
    // shape_id: TTC gives the same full Finch to Vaughan run a shape per time band (#852), so
    // the busiest shape alone covered one band and the other hours read blank.
    const full = list.filter(run => `${run.from}>${run.to}` === pair && run.pattern === pattern);
    if (full.length === 0) continue;
    const loop = full[0].from === full[0].to;

    const servicesOn = (day: DayName) => activeServiceIdsByCalendarDay.get(day) ?? new Set<string>();
    const runsOn = (day: DayName) => full.filter(run => servicesOn(day).has(run.serviceId));
    // Weekday: the same representative weekday rule the Weekday stop data uses.
    const weekdayRuns = WEEKDAY_NAMES.map(runsOn);
    const routeWeekdays = WEEKDAY_NAMES.filter(day => list.some(run => servicesOn(day).has(run.serviceId))).length;
    const weekdayIndex = pickRepresentativeWeekday(weekdayRuns.map(r => r.length), routeWeekdays >= 3);
    const days: [RunningTimeDayType, TripRun[]][] = [
      ['Saturday', runsOn('Saturday')],
      ['Sunday', runsOn('Sunday')],
    ];
    if (weekdayIndex !== null) days.unshift(['Weekday', weekdayRuns[weekdayIndex]]);
    for (const [dayType, dayRuns] of days) {
      const summary = summarize(dayRuns, loop);
      if (summary) out.set(`${key}::${dayType}`, summary);
    }
  }
  return out;
}

/**
 * The agency JSON's `runningTimes` block: `{ "<routeId>::<directionId>::<dayType>": { h, p, loop? } }`
 * with `h` = median minutes by sparkline hour and `p` = [median, min, max] by period. Short keys
 * keep it near 0.2 KB per route/direction/day.
 */
export function runningTimesJson(runningTimes: ReadonlyMap<string, RunningTimeSummary>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, summary] of [...runningTimes].sort(([a], [b]) => a.localeCompare(b))) {
    out[key] = {
      h: summary.byHour,
      p: Object.fromEntries(Object.entries(summary.byPeriod).map(([period, r]) => [period, [r!.median, r!.min, r!.max]])),
      ...(summary.loop ? { loop: true } : {}),
    };
  }
  return out;
}
