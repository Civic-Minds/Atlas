/**
 * CIV-1685: buses needed to run a route at a headway, from the agency's own schedule.
 *
 * vehicles = ceil(cycle time / headway). The cycle time is read from the feed:
 * - Preferred: block_id chains. One sample is the time between two departures of the same block
 *   from the same origin (same direction and first stop), so terminal layover is included, a loop
 *   repeats every trip and an out-and-back route every other trip. A chain is cut wherever the
 *   block switches to another route, so interlined blocks never stretch a route's cycle.
 * - Fallback (no block_id, or no repeat in the period): the median run time of each direction,
 *   added up, flagged layoverIncluded: false. No recovery percentage is invented.
 *
 * "Buses scheduled now" is the blocks (or trips, without blocks) on the route at the period's
 * midpoint, so buses still finishing the previous period's trips at its edges are not counted; the
 * most at any moment in the period is kept beside it as peakScheduledVehicles. Pure: every input is one calendar day's trips.
 */
import { PERIOD_MINUTES, type PeriodKey } from '../shared/config.js';
import { expandTripFrequencyWindows, parseFrequencyWindow, t2m, type FrequencyWindow } from './transit-utils.js';

/** One run of a vehicle on one calendar day: a trip, or one departure of a frequencies.txt trip. */
export interface TripRun {
  tripId: string;
  routeId: string;
  /** direction_id, or null when the feed gives none. */
  directionId: string | null;
  blockId: string | null;
  firstStop: string;
  lastStop: string;
  /** Minutes after midnight of the service day (may pass 1440). */
  start: number;
  end: number;
  /** The trip's stops in order; only when tripRunsForDay was asked for them. Equal sequences share one array. */
  stopIds?: readonly string[];
}

type TripRow = { trip_id: string; route_id: string; service_id: string; direction_id?: string; block_id?: string };
type StopTimeRow = { trip_id: string; arrival_time?: string; departure_time?: string; stop_id: string; stop_sequence: string | number };
type FrequencyRow = { trip_id: string; start_time: string; end_time: string; headway_secs: string | number };

/**
 * Every run on one day: the trips whose service_id is active that day, timed from their first and
 * last stop. A frequencies.txt trip becomes one run per generated departure, with no block (the
 * template's block_id cannot tell which vehicle runs which departure).
 */
export function tripRunsForDay(
  feed: { trips: readonly TripRow[]; stopTimes: readonly StopTimeRow[]; frequencies?: readonly FrequencyRow[] },
  activeServiceIds: ReadonlySet<string>,
  options: { withStops?: boolean } = {},
): TripRun[] {
  const tripsById = new Map<string, TripRow>();
  for (const trip of feed.trips) if (activeServiceIds.has(trip.service_id)) tripsById.set(trip.trip_id, trip);

  type Ends = { firstSeq: number; firstStop: string; start: number | null; lastSeq: number; lastStop: string; end: number | null };
  const ends = new Map<string, Ends>();
  const stopsByTrip = options.withStops ? new Map<string, Array<[number, string]>>() : null;
  for (const st of feed.stopTimes) {
    if (!tripsById.has(st.trip_id)) continue;
    const seq = Number(st.stop_sequence);
    if (!Number.isFinite(seq)) continue;
    if (stopsByTrip) {
      const list = stopsByTrip.get(st.trip_id) ?? [];
      list.push([seq, st.stop_id]);
      stopsByTrip.set(st.trip_id, list);
    }
    const dep = t2m(st.departure_time || st.arrival_time || '');
    const arr = t2m(st.arrival_time || st.departure_time || '');
    const e = ends.get(st.trip_id);
    if (!e) {
      ends.set(st.trip_id, { firstSeq: seq, firstStop: st.stop_id, start: dep, lastSeq: seq, lastStop: st.stop_id, end: arr });
      continue;
    }
    if (seq < e.firstSeq) { e.firstSeq = seq; e.firstStop = st.stop_id; e.start = dep; }
    if (seq > e.lastSeq) { e.lastSeq = seq; e.lastStop = st.stop_id; e.end = arr; }
  }

  const windowsByTrip = new Map<string, FrequencyWindow[]>();
  for (const f of feed.frequencies ?? []) {
    if (!tripsById.has(f.trip_id)) continue;
    const w = parseFrequencyWindow(f);
    if (!w) continue;
    const list = windowsByTrip.get(f.trip_id) ?? [];
    list.push(w);
    windowsByTrip.set(f.trip_id, list);
  }

  const interned = new Map<string, readonly string[]>();
  const stopIdsOf = (tripId: string): { stopIds?: readonly string[] } => {
    const list = stopsByTrip?.get(tripId);
    if (!list) return {};
    const ids = list.sort((a, b) => a[0] - b[0]).map(([, id]) => id);
    const key = ids.join('\u0000');
    if (!interned.has(key)) interned.set(key, ids);
    return { stopIds: interned.get(key)! };
  };

  const runs: TripRun[] = [];
  for (const [tripId, e] of ends) {
    if (e.start == null || e.end == null || e.end < e.start) continue;
    const trip = tripsById.get(tripId)!;
    const base = {
      routeId: trip.route_id,
      directionId: trip.direction_id != null && trip.direction_id !== '' ? String(trip.direction_id) : null,
      firstStop: e.firstStop,
      lastStop: e.lastStop,
      ...stopIdsOf(tripId),
    };
    const windows = windowsByTrip.get(tripId);
    if (windows) {
      const span = e.end - e.start;
      for (const start of expandTripFrequencyWindows(windows, span)) {
        runs.push({ ...base, tripId: `${tripId}@${start}`, blockId: null, start, end: start + span });
      }
    } else {
      runs.push({ ...base, tripId, blockId: trip.block_id ? trip.block_id : null, start: e.start, end: e.end });
    }
  }
  return runs;
}

/** A block's consecutive runs on one route: a chain cut wherever the block switches route. */
export interface BlockPiece {
  routeId: string;
  blockId: string;
  runs: TripRun[];
}

/** Every block's runs in time order, cut into one piece per stay on a route. */
export function blockPieces(runs: readonly TripRun[]): BlockPiece[] {
  const byBlock = new Map<string, TripRun[]>();
  for (const run of runs) {
    if (!run.blockId) continue;
    const list = byBlock.get(run.blockId) ?? [];
    list.push(run);
    byBlock.set(run.blockId, list);
  }
  const pieces: BlockPiece[] = [];
  for (const [blockId, list] of byBlock) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    let current: BlockPiece | null = null;
    for (const run of list) {
      if (!current || current.routeId !== run.routeId) {
        current = { routeId: run.routeId, blockId, runs: [] };
        pieces.push(current);
      }
      current.runs.push(run);
    }
  }
  return pieces;
}

/** The key two runs share when a vehicle has come back to where it started: direction and first stop. */
function originKey(run: TripRun): string {
  return `${run.directionId ?? ''}|${run.firstStop}`;
}

/** Cycle samples of one piece: [departure time, minutes until the same block leaves the same origin again]. */
export function cycleSamples(piece: BlockPiece): Array<[number, number]> {
  const samples: Array<[number, number]> = [];
  const { runs } = piece;
  for (let i = 0; i < runs.length; i++) {
    const key = originKey(runs[i]);
    for (let j = i + 1; j < runs.length; j++) {
      if (originKey(runs[j]) === key) {
        samples.push([runs[i].start, runs[j].start - runs[i].start]);
        break;
      }
    }
  }
  return samples;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function inWindow(t: number, w: { start: number; end: number }): boolean {
  return t >= w.start && t < w.end;
}

/**
 * Direction of a run for the run-time fallback. A feed with no direction_id pairs patterns by
 * their terminals: A to B and B to A are the two directions of one line.
 */
function fallbackDirection(run: TripRun): string {
  if (run.directionId != null) return run.directionId;
  return run.firstStop <= run.lastStop ? 'a' : 'b';
}

/**
 * Cycle time from run times only (no layover): a loop (every run starts and ends at the same stop)
 * is one run; otherwise the median run time of each direction, added up. A route that runs one
 * direction only in the window reads that one direction, and says so (oneWay).
 */
export function runTimeCycle(runs: readonly TripRun[]): { cycleMin: number; oneWay: boolean } | null {
  if (runs.length === 0) return null;
  if (runs.every(r => r.firstStop === r.lastStop)) {
    return { cycleMin: median(runs.map(r => r.end - r.start))!, oneWay: false };
  }
  const byDir = new Map<string, number[]>();
  for (const run of runs) {
    const key = fallbackDirection(run);
    const list = byDir.get(key) ?? [];
    list.push(run.end - run.start);
    byDir.set(key, list);
  }
  const dirs = [...byDir.values()].sort((a, b) => b.length - a.length).slice(0, 2);
  return { cycleMin: dirs.reduce((sum, d) => sum + median(d)!, 0), oneWay: dirs.length < 2 };
}

/** Most intervals open at once inside [window.start, window.end). Touching ends do not overlap. */
export function maxConcurrent(intervals: ReadonlyArray<[number, number]>, window: { start: number; end: number }): number {
  const events: Array<[number, number]> = [];
  for (const [s, e] of intervals) {
    if (e <= window.start || s >= window.end || e <= s) continue;
    events.push([Math.max(s, window.start), 1], [Math.min(e, window.end), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let best = 0;
  for (const [, delta] of events) {
    open += delta;
    if (open > best) best = open;
  }
  return best;
}

/** Intervals open at minute t: start <= t < end. */
export function concurrentAt(intervals: ReadonlyArray<[number, number]>, t: number): number {
  let open = 0;
  for (const [s, e] of intervals) if (s <= t && t < e) open++;
  return open;
}

/** Buses to run a cycle at a headway: ceil(cycle / headway); null when either is missing. */
export function vehiclesForHeadway(cycleMin: number | null | undefined, headwayMin: number | null | undefined): number | null {
  if (cycleMin == null || headwayMin == null || !(cycleMin > 0) || !(headwayMin > 0)) return null;
  // The epsilon keeps a cycle of exactly n headways from reading n + 1 through float error.
  return Math.ceil(cycleMin / headwayMin - 1e-9);
}

export interface RoutePeriodVehicles {
  period: PeriodKey;
  /** Trips departing in the period. */
  departures: number;
  cycleMin: number | null;
  /** True when the cycle comes from block chains (layover included); false for the run-time fallback. */
  layoverIncluded: boolean;
  /** Block samples behind cycleMin (0 on the fallback). */
  cycleSamples: number;
  /** The fallback read one direction only (a one-way route, or the other direction does not run then). */
  oneWay: boolean;
  /** Blocks (or trips) on the route at the period's midpoint. */
  scheduledVehicles: number;
  /** Most blocks (or trips) on the route at once anywhere in the period. */
  peakScheduledVehicles: number;
  scheduledBasis: 'blocks' | 'trips';
}

/**
 * Per period: cycle time and buses the schedule uses, for one route on one day.
 * `routeRuns` are the route's runs; `pieces` are its block pieces (blockPieces over every route's
 * runs that day, filtered to this route, so interlined chains are already cut).
 */
export function routePeriodVehicles(
  routeRuns: readonly TripRun[],
  pieces: readonly BlockPiece[],
  periods: Readonly<Record<PeriodKey, { start: number; end: number }>> = PERIOD_MINUTES,
): RoutePeriodVehicles[] {
  const samples = pieces.flatMap(cycleSamples);
  const intervals: Array<[number, number]> = pieces.map(p => [p.runs[0].start, Math.max(...p.runs.map(r => r.end))]);
  // A run with no block (or a frequencies.txt departure) is its own vehicle for its run only.
  for (const run of routeRuns) if (!run.blockId) intervals.push([run.start, run.end]);
  const scheduledBasis = pieces.length > 0 ? 'blocks' : 'trips';

  const out: RoutePeriodVehicles[] = [];
  for (const period of Object.keys(periods) as PeriodKey[]) {
    const w = periods[period];
    const inPeriod = routeRuns.filter(r => inWindow(r.start, w));
    const blockCycles = samples.filter(([t]) => inWindow(t, w)).map(([, c]) => c);
    const scheduledVehicles = concurrentAt(intervals, (w.start + w.end) / 2);
    const peakScheduledVehicles = maxConcurrent(intervals, w);
    if (inPeriod.length === 0) {
      out.push({ period, departures: 0, cycleMin: null, layoverIncluded: false, cycleSamples: 0, oneWay: false, scheduledVehicles, peakScheduledVehicles, scheduledBasis });
      continue;
    }
    if (blockCycles.length > 0) {
      out.push({ period, departures: inPeriod.length, cycleMin: median(blockCycles), layoverIncluded: true, cycleSamples: blockCycles.length, oneWay: false, scheduledVehicles, peakScheduledVehicles, scheduledBasis });
      continue;
    }
    const fallback = runTimeCycle(inPeriod);
    out.push({
      period,
      departures: inPeriod.length,
      cycleMin: fallback?.cycleMin ?? null,
      layoverIncluded: false,
      cycleSamples: 0,
      oneWay: fallback?.oneWay ?? false,
      scheduledVehicles,
      peakScheduledVehicles,
      scheduledBasis,
    });
  }
  return out;
}

/** Every route's per-period vehicles on one day, keyed by route_id. */
export function vehiclesByRoute(
  runs: readonly TripRun[],
  periods: Readonly<Record<PeriodKey, { start: number; end: number }>> = PERIOD_MINUTES,
): Map<string, RoutePeriodVehicles[]> {
  const piecesByRoute = new Map<string, BlockPiece[]>();
  for (const piece of blockPieces(runs)) {
    const list = piecesByRoute.get(piece.routeId) ?? [];
    list.push(piece);
    piecesByRoute.set(piece.routeId, list);
  }
  const runsByRoute = new Map<string, TripRun[]>();
  for (const run of runs) {
    const list = runsByRoute.get(run.routeId) ?? [];
    list.push(run);
    runsByRoute.set(run.routeId, list);
  }
  const out = new Map<string, RoutePeriodVehicles[]>();
  for (const [routeId, routeRuns] of runsByRoute) {
    out.set(routeId, routePeriodVehicles(routeRuns, piecesByRoute.get(routeId) ?? [], periods));
  }
  return out;
}
