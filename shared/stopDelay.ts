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
  /** The trip's first stop: its departure from the end of the line, which is what the headline counts (as the TTC does). */
  tripStart?: boolean;
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
/** A stretch "grows" delay in a run when it adds at least this many minutes (30 seconds). */
export const GROW_MIN = 0.5;
/** A stretch stands out when its median added delay is at least this many minutes... */
export const STEP_MIN = 0.5;
/** ...and the delay stays up for the next 3 stops or about 1 km, whichever is longer. */
export const HOLDS_STOPS = 3;
export const HOLDS_M = 1000;
/** With no stretch standing out, delay that still builds by this many minutes along the route is called gradual. */
export const GRADUAL_MIN = 1;

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
export function adherenceReport(runs: readonly RunDelays[], options: { timepointsOnly?: boolean; tripStartsOnly?: boolean } = {}): AdherenceReport {
  if (options.timepointsOnly) {
    runs = runs.map(r => ({ ...r, stops: r.stops.filter(s => s.timepoint === true) })).filter(r => r.stops.length > 0);
  }
  // The headline: each trip's departure from the end of the line (its first stop), as the TTC measures on-time.
  if (options.tripStartsOnly) {
    runs = runs.map(r => ({ ...r, stops: r.stops.filter(s => s.tripStart === true) })).filter(r => r.stops.length > 0);
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
  /** Share of those runs where delay grew by GROW_MIN or more here: how consistent the build-up is. */
  growShare: number;
  /** Median delay at the second stop and its 10th-90th percentile range, minutes. */
  medianDelayMin: number;
  /** Touches a terminal: drawn, but left out of where delay builds up and of the climb (loop and layover time). */
  terminal?: boolean;
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
  /**
   * 'forms': the stretch with the largest median added delay (at least STEP_MIN) whose delay stays up for the next
   * HOLDS_STOPS stops / HOLDS_M metres. 'gradual': none stands out, but delay still builds by GRADUAL_MIN along the route.
   * 'none': flat. Null when there is nothing to judge.
   */
  kind: 'forms' | 'gradual' | 'none' | null;
  forms: Stretch | null;
  /** Median delay at the end of the route minus at its start, minutes. */
  climbMin: number | null;
}

/**
 * B3: where delays start. `order` is each direction's stop order (its busiest pattern). A stretch is a pair of consecutive
 * stops; only runs seen at both count. Delay starts at the first stretch that adds more than a minute in half the runs.
 */
/**
 * `atTerminal(stopId)`: a stop at or next to a pattern's end. A stretch touching one is still drawn, but is never named
 * where delay builds up: running into or out of a terminal includes loop and layover time, not delay (the same rule
 * B4's slow-stretch link uses).
 */
export function delayBuildup(runs: readonly RunDelays[], order: ReadonlyMap<number, readonly string[]>, alongM?: ReadonlyMap<string, number>, atTerminal: (stopId: string) => boolean = () => false): DelayBuildup[] {
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
        growShare: added.filter(x => x >= GROW_MIN).length / added.length,
        medianDelayMin: median(atB)!, p10DelayMin: percentile(atB, 0.1)!, p90DelayMin: percentile(atB, 0.9)!,
        ...(atTerminal(a) || atTerminal(b) ? { terminal: true } : {}),
      });
    }
    const enough = stretches.filter(s => s.n >= MIN_SAMPLES);
    const nameable = enough.filter(s => !s.terminal);
    // The delay before each stretch is what the previous stretch left it at (or the route's starting delay).
    let forms: Stretch | null = null;
    for (const s of nameable) {
      if (s.medianAddedMin < STEP_MIN) continue;
      const i = stretches.indexOf(s);
      const before = s.medianDelayMin - s.medianAddedMin;
      let end = Math.min(stretches.length, i + 1 + HOLDS_STOPS);
      const a0 = alongM?.get(`${directionId}|${s.toStopId}`);
      if (a0 != null) while (end < stretches.length && (alongM!.get(`${directionId}|${stretches[end - 1].toStopId}`) ?? a0) < a0 + HOLDS_M) end++;
      const after = stretches.slice(i + 1, end);
      if (after.every(f => f.n < MIN_SAMPLES || f.medianDelayMin >= before + 0.5 * s.medianAddedMin) && (!forms || s.medianAddedMin > forms.medianAddedMin)) forms = s;
    }
    // The climb runs from where the first non-terminal stretch starts to where the last one ends: the run out of and into
    // a terminal is loop and layover time, not delay.
    const firstStretch = nameable.length ? nameable[0] : null;
    const startDelay = firstStretch && (firstStretch !== enough[0] || first.length < MIN_SAMPLES)
      ? firstStretch.medianDelayMin - firstStretch.medianAddedMin
      : first.length >= MIN_SAMPLES ? median(first)! : null;
    const lastStretch = nameable.length ? nameable[nameable.length - 1] : null;
    const climbMin = startDelay != null && lastStretch ? lastStretch.medianDelayMin - startDelay : null;
    out.push({
      kind: climbMin == null && !forms ? null : forms ? 'forms' : (climbMin ?? 0) >= GRADUAL_MIN ? 'gradual' : 'none',
      forms, climbMin,
      directionId,
      startingDelayMin: first.length >= MIN_SAMPLES ? median(first) : null,
      stretches,
      start: nameable.find(s => s.addedShare >= ADDED_DELAY_SHARE) ?? null,
      biggest: nameable.length ? nameable.reduce((best, s) => (s.medianAddedMin > best.medianAddedMin ? s : best)) : null,
    });
  }
  return out;
}
