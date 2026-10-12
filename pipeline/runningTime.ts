/**
 * Scheduled running time per route, direction and day type (CIV-84): how long the main pattern's
 * full end-to-end trips take, from the first stop's departure to the last stop's arrival, by hour
 * of departure and by Atlas period. Additive data for the route card; never in map tiles.
 *
 * Fail closed: only full trips of the main pattern count (the shapes the headway filter analyses,
 * between the pattern's own two terminals), and an hour or period with fewer than two trips is
 * left out rather than guessed. Loops (start and end at the same stop or station) are measured as
 * a full loop and flagged, never halved.
 */
import type { DayName, GtfsData, GtfsRoute } from '../types/gtfs.js';
import { SPARKLINE_HOURS, TIME_PERIODS, type PeriodKey } from '../shared/config.js';
import { t2m } from './transit-utils.js';
import { representativeWeekdayIndex } from './transit-phase2.js';

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
  routeId: string;
  dirId: string;
  serviceId: string;
  shapeId: string | null;
  from: string;
  to: string;
  stops: number;
  start: number;
  minutes: number;
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(runs: readonly TripRun[], loop: boolean): RunningTimeSummary | null {
  // One run per departure minute: identical trips under overlapping service_ids count once.
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

/**
 * Running time keyed `${routeId}::${directionId}::${dayType}`. `analysisShapes` is the shape
 * filter phase 1 uses (`route::dir` keys); routes without an entry (rail) use their dominant shape.
 */
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

  // One pass over stop_times: first departure and last arrival of every trip.
  const first = new Map<string, { seq: number; stop: string; time: number | null }>();
  const last = new Map<string, { seq: number; stop: string; time: number | null }>();
  const stopCount = new Map<string, number>();
  for (const st of gtfs.stopTimes ?? []) {
    if (!tripById.has(st.trip_id)) continue;
    stopCount.set(st.trip_id, (stopCount.get(st.trip_id) ?? 0) + 1);
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    const f = first.get(st.trip_id);
    if (!f || seq < f.seq) first.set(st.trip_id, { seq, stop: st.stop_id, time: t2m(st.departure_time) ?? t2m(st.arrival_time) });
    const l = last.get(st.trip_id);
    if (!l || seq > l.seq) last.set(st.trip_id, { seq, stop: st.stop_id, time: t2m(st.arrival_time) ?? t2m(st.departure_time) });
  }

  // Frequency-based trips: the template's own duration applies to every expanded departure.
  const frequencyStarts = new Map<string, number[]>();
  for (const freq of gtfs.frequencies ?? []) {
    const start = t2m(freq.start_time), end = t2m(freq.end_time), headway = parseInt(freq.headway_secs);
    if (start === null || end === null || Number.isNaN(headway) || headway < 60) continue;
    const starts = frequencyStarts.get(freq.trip_id) ?? [];
    for (let s = start * 60; s < end * 60; s += headway) starts.push(s / 60);
    frequencyStarts.set(freq.trip_id, starts);
  }

  const runs: TripRun[] = [];
  for (const [tripId, trip] of tripById) {
    const f = first.get(tripId), l = last.get(tripId);
    // Missing or impossible times are dropped, never patched.
    if (!f || !l || f.time === null || l.time === null) continue;
    const minutes = l.time - f.time;
    if (!(minutes > 0) || minutes > MAX_TRIP_MINUTES) continue;
    const base = {
      routeId: trip.route_id,
      dirId: trip.direction_id?.trim() || '0',
      serviceId: trip.service_id,
      shapeId: trip.shape_id || null,
      from: place(f.stop),
      to: place(l.stop),
      stops: stopCount.get(tripId) ?? 0,
      minutes,
    };
    const starts = frequencyStarts.get(tripId);
    if (starts) for (const start of starts) runs.push({ ...base, start: Math.round(start) });
    else runs.push({ ...base, start: f.time });
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
    // Main pattern: the analysis shapes (or, without a filter, the busiest shape)...
    let shapes = analysisShapes.get(key);
    if (!shapes) {
      const counts = new Map<string, number>();
      for (const run of list) if (run.shapeId) counts.set(run.shapeId, (counts.get(run.shapeId) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      shapes = top ? new Set([top]) : undefined;
    }
    // Very short trips (a direction mostly of 2-stop shuttles, TTC 52) never set the pattern: only
    // trips serving at least half the stops of the direction's longest trip are considered.
    // If the analysis shapes hold no such trips (TTC 52 westbound: its busiest shape is a 2-stop
    // shuttle), the direction's long trips are used instead.
    const longest = Math.max(...list.map(run => run.stops));
    const long = list.filter(run => run.stops >= longest / 2);
    const onShapes = shapes ? long.filter(run => run.shapeId && shapes!.has(run.shapeId)) : long;
    const onPattern = onShapes.length > 0 ? onShapes : long;
    // ...between its own two terminals: the busiest first/last stop pair. Short turns, partial
    // trips and variants with other ends drop out instead of pulling the median down.
    const pairCounts = new Map<string, number>();
    for (const run of onPattern) pairCounts.set(`${run.from}>${run.to}`, (pairCounts.get(`${run.from}>${run.to}`) ?? 0) + 1);
    const pair = [...pairCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    if (!pair) continue;
    const full = onPattern.filter(run => `${run.from}>${run.to}` === pair);
    const loop = full[0].from === full[0].to;

    const runsOn = (day: DayName) => {
      const ids = activeServiceIdsByCalendarDay.get(day) ?? new Set<string>();
      return full.filter(run => ids.has(run.serviceId));
    };
    // Weekday: one representative weekday, picked like the Weekday stop data (#710).
    const weekdayRuns = WEEKDAY_NAMES.map(runsOn);
    const weekdayIndex = representativeWeekdayIndex(weekdayRuns.map(r => r.length));
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
 * with `h` = median minutes by sparkline hour and `p` = { median, min, max } by period. Short keys
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
