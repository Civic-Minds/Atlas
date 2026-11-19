/**
 * A route right now (CIV-1870): where its vehicles are bunched and where riders have waited longest, from the last half
 * hour of the Live recorder's position snapshots. One calculation for the Atlas Studio MCP's route_now and Studio's view
 * (CIV-1893).
 *
 * Gaps are observed at stops, as Live's weekly figures count them (shared/bunching.ts): the time between two vehicles
 * passing the same stop, whichever branch or trip they run. Each stop is judged against its own scheduled gap for the
 * period, Atlas's published figure for that stop (stopPeriodHeadways: both branches together on a shared stretch).
 * Bunched and gapped use the shared cut-offs (shared/liveCutoffs.ts), standard unless a planner sets their own.
 *
 * Pure: the caller passes the snapshots and the route's patterns (nowDirections builds them from the route's rows).
 */
import { buildShape } from './shapeProjection.js';
import { projectRun, stopPassages, SEGMENT_DEFAULTS, type Pattern, type PositionSample } from './segmentDelay.js';
import { DEFAULT_CUTOFFS, type Cutoffs } from './liveCutoffs.js';
import { LIVE_STALE_SEC } from './rules/live.js';
import type { PeriodKey } from './rules/periods.js';
import { directionBranchFallback } from './headsignDisplay.js';

/** How far back a "right now" answer looks for vehicles passing stops. */
export const NOW_WINDOW_MIN = 30;
/** Bunched "now" means the last two vehicles at a stop passed within the cut-off, the later one at most this long ago. */
export const NOW_RECENT_MIN = 10;
/** The line is drawn through its stops, so a vehicle between two stops on a curve sits a little off it. */
const NOW_MAX_OFF_LINE_M = 150;
/** A vehicle counts as running when it moved at least this far along its line in the last NOW_RECENT_MIN minutes. */
const NOW_MOVING_M = 200;
/** One vehicle passing a stop twice this close together (a trip id changing at a terminal) counts once. */
const SAME_VEHICLE_SEC = 120;

export interface NowVehicle { id: string; r: string; tripId?: string | null; d: number | null; lat: number; lon: number; t: number | null }
export interface NowSnapshot { capturedAt: number; vehicles: NowVehicle[] }
/** A stop on a pattern, with its scheduled gap this period (null where the route has none then). */
export interface NowStop { stopId: string; name: string; lat: number; lon: number; scheduledGapMin: number | null }
/** One direction of the route: where it heads and each regular pattern's stops in order (branches, short turns). */
export interface NowDirection { directionId: number; label: string; patterns: NowStop[][] }

export type GapKind = 'bunched' | 'gapped' | 'even';

/** Stops next to each other where the same thing is happening now. */
export interface NowStretch {
  fromStop: string;
  toStop: string;
  stops: number;
  /** Bunched: the shortest gap between the last two vehicles. Gapped: the longest wait so far. Minutes. */
  minutes: number;
  /** Bunched: how long ago the later vehicle passed. */
  minAgo?: number;
  /** The scheduled gap there this period. */
  scheduledGapMin: number | null;
}

export interface NowDirectionFigures {
  directionId: number;
  direction: string;
  /** Vehicles in the newest snapshot moving along this direction's lines. */
  vehiclesNow: number;
  /** Vehicles in the newest snapshot on this direction that haven't moved lately (at a terminal, held, out of service). */
  standingNow: number;
  /** Where the last two vehicles passed within the bunched cut-off, the later one in the last NOW_RECENT_MIN minutes. */
  bunchedNow: NowStretch[];
  /** Where riders have waited more than the gapped factor times the scheduled gap since the last vehicle seen there. */
  gappedNow: NowStretch[];
  /**
   * Stops where no vehicle was seen passing in the whole half hour though the route is scheduled there now: either none
   * ran there, or vehicles ran elsewhere (a diversion the stop list doesn't show). Not called gapped, since Atlas can't
   * tell which.
   */
  noneSeen: Array<{ fromStop: string; toStop: string; stops: number; scheduledGapMin: number | null }>;
  /** The stop where riders have waited longest since the last vehicle seen there, against its scheduled gap. */
  longestWait: { stop: string; minutes: number; scheduledGapMin: number | null } | null;
  /** Every gap at every stop in the half hour, against each stop's scheduled gap. */
  lastHalfHour: { gaps: number; bunchedShare: number; gappedShare: number } | null;
}

export interface RouteNow {
  /** Unix seconds of the newest snapshot. Null when there is none in the half hour. */
  asOf: number | null;
  ageSec: number | null;
  /** The newest snapshot is older than LIVE_STALE_SEC: no current figures. */
  stale: boolean;
  windowMin: number;
  cutoffs: Cutoffs;
  directions: NowDirectionFigures[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** A gap's kind at the cut-offs: bunched under the bunched cut-off, gapped over the factor times the scheduled gap. */
export function gapKind(gapSec: number, scheduledGapMin: number | null, c: Cutoffs): GapKind {
  if (gapSec < c.bunchedWithinMin * 60) return 'bunched';
  if (scheduledGapMin != null && gapSec > c.gappedFactor * scheduledGapMin * 60) return 'gapped';
  return 'even';
}

/** The rows a route file holds for one route on one day, as much as nowDirections reads of them. */
export interface NowRouteRow { directionId: number | string; headsign?: string | null; stopOrder?: string[] | null; stopPeriodHeadways?: Record<string, Partial<Record<PeriodKey, number>>> | null }

/**
 * The route's patterns for a "right now" answer, from its rows on the day: each regular pattern (a row with a stop
 * list) per direction, with each stop's scheduled gap for the period. A direction is named after its longest pattern.
 */
export function nowDirections(rows: readonly NowRouteRow[], stops: ReadonlyMap<string, { name: string; lat: number; lon: number }>, period: PeriodKey | null): NowDirection[] {
  const out: NowDirection[] = [];
  for (const d of [...new Set(rows.map(r => Number(r.directionId)))].sort((a, b) => a - b)) {
    const mine = rows.filter(r => Number(r.directionId) === d && r.stopOrder && r.stopOrder.length >= 2).sort((a, b) => b.stopOrder!.length - a.stopOrder!.length);
    if (!mine.length) continue;
    const patterns = mine.map(r => r.stopOrder!.flatMap(id => {
      const s = stops.get(id);
      return s ? [{ stopId: id, name: s.name, lat: s.lat, lon: s.lon, scheduledGapMin: (period && r.stopPeriodHeadways?.[id]?.[period]) ?? null }] : [];
    })).filter(p => p.length >= 2);
    if (patterns.length) out.push({ directionId: d, label: directionBranchFallback(d, mine[0].headsign ? `To ${mine[0].headsign}` : undefined), patterns });
  }
  return out;
}

function patternOf(id: string, directionId: number, stops: NowStop[]): Pattern {
  const shape = buildShape(stops.map(s => [s.lon, s.lat] as [number, number]));
  // buildShape keeps every vertex at decimate 0, so each stop is a vertex and its distance along is that vertex's.
  return { id, directionId, shape, stops: stops.map((s, i) => ({ stopId: s.stopId, along: shape.cum[i] })) };
}

function place(samples: PositionSample[], pattern: Pattern) {
  const projected = projectRun(samples, pattern);
  const passages = stopPassages(projected, pattern, { ...SEGMENT_DEFAULTS, maxPerpM: NOW_MAX_OFF_LINE_M }).flat();
  const newest = samples.at(-1)!;
  const recent = projected.filter(p => p.perpM <= NOW_MAX_OFF_LINE_M && p.t >= newest.t - NOW_RECENT_MIN * 60).map(p => p.along);
  return { passages, moving: recent.length >= 2 && Math.max(...recent) - Math.min(...recent) >= NOW_MOVING_M };
}

export function routeNow(input: {
  snapshots: readonly NowSnapshot[];
  routeIds: readonly string[];
  directions: readonly NowDirection[];
  nowSec: number;
  cutoffs?: Cutoffs;
}): RouteNow {
  const c = input.cutoffs ?? DEFAULT_CUTOFFS;
  const from = input.nowSec - NOW_WINDOW_MIN * 60;
  const ids = new Set(input.routeIds);
  const snaps = input.snapshots.filter(s => s.capturedAt >= from && s.capturedAt <= input.nowSec).sort((a, b) => a.capturedAt - b.capturedAt);
  const newest = snaps.at(-1) ?? null;
  const ageSec = newest ? input.nowSec - newest.capturedAt : null;
  const stale = ageSec == null || ageSec > LIVE_STALE_SEC;
  const base = { asOf: newest?.capturedAt ?? null, ageSec, stale, windowMin: NOW_WINDOW_MIN, cutoffs: c };
  if (stale || !newest) return { ...base, directions: [] };

  // Each run (a vehicle on one trip) as its samples in time order.
  const runs = new Map<string, { id: string; d: number | null; samples: PositionSample[]; now: boolean }>();
  for (const s of snaps) for (const v of s.vehicles) {
    if (!ids.has(v.r)) continue;
    const key = `${v.id}|${v.tripId ?? ''}`;
    const run = runs.get(key) ?? runs.set(key, { id: v.id, d: v.d, samples: [], now: false }).get(key)!;
    const t = v.t ?? s.capturedAt;
    if (!run.samples.length || run.samples[run.samples.length - 1].t < t) run.samples.push({ t, lat: v.lat, lon: v.lon });
    if (v.d != null) run.d = v.d;
    if (s === newest) run.now = true;
  }

  const patterns = input.directions.flatMap(d => d.patterns.map((p, i) => ({ dir: d.directionId, pattern: patternOf(`${d.directionId}-${i}`, d.directionId, p) })));
  const passed = new Map<number, Map<string, Array<{ t: number; vid: string }>>>(input.directions.map(d => [d.directionId, new Map()]));
  const counts = new Map<number, { moving: number; standing: number }>(input.directions.map(d => [d.directionId, { moving: 0, standing: 0 }]));
  for (const run of runs.values()) {
    // The pattern the vehicle was seen passing most stops on (feeds' direction ids don't always match the timetable's);
    // the feed's own direction only settles a tie, such as a vehicle that has passed no stop yet.
    let best: { dir: number; passages: ReturnType<typeof place>['passages']; moving: boolean } | null = null;
    for (const p of patterns) {
      const r = place(run.samples, p.pattern);
      if (!best || r.passages.length > best.passages.length || (r.passages.length === best.passages.length && p.dir === run.d && best.dir !== run.d)) best = { dir: p.dir, ...r };
    }
    if (!best || (!best.passages.length && run.d !== best.dir)) continue;
    const at = passed.get(best.dir)!;
    for (const x of best.passages) (at.get(x.stopId) ?? at.set(x.stopId, []).get(x.stopId)!).push({ t: x.t, vid: run.id });
    if (run.now) { const n = counts.get(best.dir)!; if (best.moving) n.moving++; else n.standing++; }
  }

  const directions = input.directions.map((dir): NowDirectionFigures => {
    const at = passed.get(dir.directionId)!;
    const stopInfo = new Map(dir.patterns.flat().map(s => [s.stopId, s]));
    // Each stop's passing times, one per vehicle visit.
    const times = new Map<string, number[]>();
    for (const [stopId, xs] of at) {
      const kept: Array<{ t: number; vid: string }> = [];
      for (const x of xs.sort((a, b) => a.t - b.t)) if (!kept.some(k => k.vid === x.vid && x.t - k.t < SAME_VEHICLE_SEC)) kept.push(x);
      times.set(stopId, kept.map(k => k.t));
    }
    let n = 0, bunched = 0, gapped = 0;
    for (const [stopId, ts] of times) for (let i = 1; i < ts.length; i++) {
      n++;
      const k = gapKind(ts[i] - ts[i - 1], stopInfo.get(stopId)?.scheduledGapMin ?? null, c);
      if (k === 'bunched') bunched++; else if (k === 'gapped') gapped++;
    }
    // Each stop now: bunched (the last two passed close, recently) and the wait since the last vehicle.
    type StopNow = { bunchedMin: number | null; minAgo: number | null; waitMin: number; atLeast: boolean; scheduledGapMin: number | null };
    const now = new Map<string, StopNow>();
    // A pattern's first stop is left out: a vehicle waiting at the terminal is seen leaving it only roughly.
    const firsts = new Set(dir.patterns.map(p => p[0].stopId));
    for (const s of stopInfo.values()) {
      if (s.scheduledGapMin == null || firsts.has(s.stopId)) continue; // no service scheduled here this period
      const ts = times.get(s.stopId) ?? [];
      const last = ts.at(-1), prev = ts.at(-2);
      const bunchedNow = last != null && prev != null && input.nowSec - last <= NOW_RECENT_MIN * 60 && gapKind(last - prev, s.scheduledGapMin, c) === 'bunched';
      now.set(s.stopId, {
        // Rounded down, so a gap just under the cut-off never reads as the cut-off itself ("2 min" for 1.97).
        bunchedMin: bunchedNow ? Math.floor(((last! - prev!) / 60) * 10) / 10 : null, minAgo: bunchedNow ? r1((input.nowSec - last!) / 60) : null,
        waitMin: r1((input.nowSec - (last ?? from)) / 60), atLeast: last == null, scheduledGapMin: s.scheduledGapMin,
      });
    }
    const isGapped = (x: StopNow) => !x.atLeast && x.scheduledGapMin != null && x.waitMin > c.gappedFactor * x.scheduledGapMin;
    const stretches = (flag: (x: StopNow) => boolean, make: (run: NowStop[], xs: StopNow[]) => NowStretch) => {
      const out: NowStretch[] = [];
      // A stop shows in one stretch only, though every pattern through a shared trunk finds it: a branch's stretch
      // starts where the trunk's ended.
      const shown = new Set<string>();
      for (const p of dir.patterns) {
        let run: NowStop[] = [];
        const flush = () => {
          if (run.length) { out.push(make(run, run.map(s => now.get(s.stopId)!))); for (const s of run) shown.add(s.stopId); }
          run = [];
        };
        for (const s of p) { const x = now.get(s.stopId); if (x && flag(x) && !shown.has(s.stopId)) run.push(s); else flush(); }
        flush();
      }
      return out;
    };
    const ends = (run: NowStop[]) => ({ fromStop: run[0].name, toStop: run[run.length - 1].name, stops: run.length });
    const bunchedNow = stretches(x => x.bunchedMin != null, (run, xs) => {
      const k = xs.reduce((m, x) => (x.bunchedMin! < m.bunchedMin! ? x : m));
      return { ...ends(run), minutes: k.bunchedMin!, minAgo: Math.min(...xs.map(x => x.minAgo!)), scheduledGapMin: k.scheduledGapMin };
    });
    const gappedNow = stretches(isGapped, (run, xs) => {
      const k = xs.reduce((m, x) => (x.waitMin > m.waitMin ? x : m));
      return { ...ends(run), minutes: k.waitMin, scheduledGapMin: k.scheduledGapMin };
    });
    const noneSeen = stretches(x => x.atLeast, (run, xs) => ({ ...ends(run), minutes: NOW_WINDOW_MIN, scheduledGapMin: xs[0].scheduledGapMin }))
      .map(({ fromStop, toStop, stops, scheduledGapMin }) => ({ fromStop, toStop, stops, scheduledGapMin }));
    const longest = [...now].filter(e => !e[1].atLeast).reduce<[string, StopNow] | null>((m, e) => (!m || e[1].waitMin > m[1].waitMin ? e : m), null);
    const cnt = counts.get(dir.directionId)!;
    return {
      directionId: dir.directionId,
      direction: dir.label,
      vehiclesNow: cnt.moving,
      standingNow: cnt.standing,
      bunchedNow,
      gappedNow,
      noneSeen,
      longestWait: longest ? { stop: stopInfo.get(longest[0])!.name, minutes: longest[1].waitMin, scheduledGapMin: longest[1].scheduledGapMin } : null,
      lastHalfHour: n ? { gaps: n, bunchedShare: r3(bunched / n), gappedShare: r3(gapped / n) } : null,
    };
  });
  return { ...base, directions };
}
