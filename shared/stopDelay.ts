/**
 * Route analysis from stop delays (Live dashboard: adherence, stops with the most delay, where delays start).
 * Our own calculation, for feeds with no delay values: delay at a stop = the time a vehicle actually passed the stop
 * (interpolated from archived positions) minus the timetable's departure time for that trip at that stop.
 * Pure functions over per-run stop delays; scripts/live-segment-delay.ts builds the runs.
 */
import { delayStatus } from './liveDelayStatus.js';
import { median, percentile } from './segmentDelay.js';

export interface RunStopDelay {
  stopId: string;
  /** Epoch seconds the vehicle passed the stop. */
  t: number;
  /** Local hour of day (0-23) of the passage. */
  hour: number;
  /** Actual minus timetable, seconds (positive = late). */
  delaySec: number;
  /** True when the timetable marks this stop as a timepoint (a time the operator actually schedules to). */
  timepoint?: boolean;
}

export interface RunDelays {
  /** GTFS service date, YYYY-MM-DD. */
  date: string;
  directionId: number;
  tripId: string;
  /** In travel order. */
  stops: RunStopDelay[];
}

/** A stop needs this many passages before it is ranked or a stretch before its start is called. */
export const MIN_SAMPLES = 30;
/** A stretch "adds" delay when the delay grows by more than this many minutes between two stops. */
export const ADDED_DELAY_MIN = 1;
/** ...and it is where delays start when that happens in at least this share of runs. */
export const ADDED_DELAY_SHARE = 0.5;

export interface Adherence {
  n: number;
  early: number;
  onTime: number;
  late: number;
  /** Shares of n (0-1). */
  earlyShare: number;
  onTimeShare: number;
  lateShare: number;
  /** Share that is not late (early or on time): the reliable headline, since a car ahead of the timetable may simply wait. */
  notLateShare: number;
}

function tally(minutes: number[]): Adherence {
  let early = 0, onTime = 0, late = 0;
  for (const m of minutes) {
    const s = delayStatus(m);
    if (s === 'early') early++; else if (s === 'late') late++; else onTime++;
  }
  const n = minutes.length;
  return { n, early, onTime, late, earlyShare: n ? early / n : 0, onTimeShare: n ? onTime / n : 0, lateShare: n ? late / n : 0, notLateShare: n ? (early + onTime) / n : 0 };
}

const minutesOf = (runs: readonly RunDelays[]): number[] => runs.flatMap(r => r.stops.map(s => s.delaySec / 60));

export interface AdherenceReport {
  overall: Adherence;
  byHour: Array<{ hour: number } & Adherence>;
  byDate: Array<{ date: string } & Adherence>;
  byDirection: Record<string, Adherence>;
}

/**
 * B1: how well the route keeps to its timetable. `timepointsOnly` counts only the stops the timetable marks as timepoints:
 * between them the timetable's times are interpolated, so a car running a little fast is not really "early".
 */
export function adherenceReport(runs: readonly RunDelays[], options: { timepointsOnly?: boolean } = {}): AdherenceReport {
  if (options.timepointsOnly) {
    runs = runs.map(r => ({ ...r, stops: r.stops.filter(s => s.timepoint === true) })).filter(r => r.stops.length > 0);
  }
  const byHour = new Map<number, number[]>();
  const byDate = new Map<string, number[]>();
  const byDir = new Map<number, number[]>();
  for (const r of runs) {
    for (const s of r.stops) {
      const m = s.delaySec / 60;
      (byHour.get(s.hour) ?? byHour.set(s.hour, []).get(s.hour)!).push(m);
      (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(m);
      (byDir.get(r.directionId) ?? byDir.set(r.directionId, []).get(r.directionId)!).push(m);
    }
  }
  return {
    overall: tally(minutesOf(runs)),
    byHour: [...byHour].sort((a, b) => a[0] - b[0]).map(([hour, m]) => ({ hour, ...tally(m) })),
    byDate: [...byDate].sort((a, b) => a[0].localeCompare(b[0])).map(([date, m]) => ({ date, ...tally(m) })),
    byDirection: Object.fromEntries([...byDir].sort((a, b) => a[0] - b[0]).map(([d, m]) => [String(d), tally(m)])),
  };
}

export interface StopDelayStat {
  stopId: string;
  directionId: number;
  n: number;
  medianMin: number;
  p90Min: number;
  lateShare: number;
  earlyShare: number;
  /** False when n < MIN_SAMPLES: listed, but not ranked. */
  ranked: boolean;
}

/** B2: delay at each stop, per direction. The caller ranks the `ranked` ones by medianMin. */
export function stopDelayStats(runs: readonly RunDelays[]): StopDelayStat[] {
  const by = new Map<string, number[]>();
  for (const r of runs) for (const s of r.stops) {
    const k = `${s.stopId}|${r.directionId}`;
    (by.get(k) ?? by.set(k, []).get(k)!).push(s.delaySec / 60);
  }
  return [...by].map(([k, m]) => {
    const [stopId, dir] = k.split('|');
    const t = tally(m);
    return { stopId, directionId: Number(dir), n: m.length, medianMin: median(m)!, p90Min: percentile(m, 0.9)!, lateShare: t.lateShare, earlyShare: t.earlyShare, ranked: m.length >= MIN_SAMPLES };
  });
}

export interface Stretch {
  fromStopId: string;
  toStopId: string;
  /** Runs seen at both stops. */
  n: number;
  /** Median of (delay at the second stop minus delay at the first), minutes. */
  medianAddedMin: number;
  /** Share of those runs that added more than ADDED_DELAY_MIN. */
  addedShare: number;
  /** Median delay at the second stop and its 10th-90th percentile range, minutes. */
  medianDelayMin: number;
  p10DelayMin: number;
  p90DelayMin: number;
}

export interface DelayBuildup {
  directionId: number;
  /** Median delay at the first stop of the route, minutes (late departures from the terminal). */
  startingDelayMin: number | null;
  stretches: Stretch[];
  /** First stretch (in travel order) that adds delay in at least ADDED_DELAY_SHARE of runs; null when none does. */
  start: Stretch | null;
  /** The stretch with the largest median added delay (among those with enough runs). */
  biggest: Stretch | null;
}

/**
 * B3: where delays start. `order` is each direction's stop order (its busiest pattern). A stretch is a pair of consecutive
 * stops; only runs seen at both count. Delay starts at the first stretch that adds more than a minute in half the runs.
 */
export function delayBuildup(runs: readonly RunDelays[], order: ReadonlyMap<number, readonly string[]>): DelayBuildup[] {
  const out: DelayBuildup[] = [];
  for (const [directionId, stopIds] of order) {
    const perRun = runs.filter(r => r.directionId === directionId).map(r => new Map(r.stops.map(s => [s.stopId, s.delaySec / 60])));
    const first = stopIds.length ? perRun.map(m => m.get(stopIds[0])).filter((x): x is number => x != null) : [];
    const stretches: Stretch[] = [];
    for (let i = 0; i < stopIds.length - 1; i++) {
      const a = stopIds[i], b = stopIds[i + 1];
      const added: number[] = [];
      const atB: number[] = [];
      for (const m of perRun) {
        const da = m.get(a), db = m.get(b);
        if (da == null || db == null) continue;
        added.push(db - da);
        atB.push(db);
      }
      if (added.length === 0) continue;
      stretches.push({
        fromStopId: a, toStopId: b, n: added.length,
        medianAddedMin: median(added)!, addedShare: added.filter(x => x > ADDED_DELAY_MIN).length / added.length,
        medianDelayMin: median(atB)!, p10DelayMin: percentile(atB, 0.1)!, p90DelayMin: percentile(atB, 0.9)!,
      });
    }
    const enough = stretches.filter(s => s.n >= MIN_SAMPLES);
    out.push({
      directionId,
      startingDelayMin: first.length >= MIN_SAMPLES ? median(first) : null,
      stretches,
      start: enough.find(s => s.addedShare >= ADDED_DELAY_SHARE) ?? null,
      biggest: enough.length ? enough.reduce((best, s) => (s.medianAddedMin > best.medianAddedMin ? s : best)) : null,
    });
  }
  return out;
}
