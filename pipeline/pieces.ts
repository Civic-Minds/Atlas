/**
 * Pieces (CIV-1959, #1620): the one place a route's pieces are defined.
 *
 * A piece is a stretch of a route direction that one set of trips serves: the trunk (the stops
 * every regular pattern shares), each branch (a tail off the trunk) and each short-turn segment.
 * This module is a wrapper, not new behaviour. It reads what the pipeline already decides:
 *
 * - who pools with whom at each stop: computeStopSharers (stopPools.ts), through patternPools;
 * - the trunk and the branches: directionStretches (tripSets.ts), through directionPieces
 *   (its `trunkStopMask` and the pooled `sharedStretches` are stamped from the same answers);
 * - the size minimum (5 stops, 1 km): PIECE_PARAMS (pieceParams.ts).
 *
 * Pools are directional. A same-headsign short turn pools on its own stops for the short turn
 * but only on the aligned run for the long pattern, so a piece keeps pools per owning pattern,
 * never one symmetric member list. Later commits build the reading rule on these pieces.
 */
import { branchReadingsEnabled, headlineFromTrunkEnabled, pieceReadingEnabled } from '../shared/rules/flags.js';
import type { PieceReadingEntry, PieceReadings, PieceTreatment } from '../shared/pieceReadings.js';
import { PERIOD_MINUTES, type PeriodKey } from '../shared/rules/periods.js';
import { PUBLIC_TIER_MAXES } from '../shared/rules/frequency.js';
import { departuresInWindow, HEADLINE_MIN_DEPARTURES, isSteadyPeriodGaps, medianHeadwayInWindow } from './headway-utils.js';
import type { SharedStretchPattern } from './sharedStretch.js';
import { collapseBunched, computeStopSharers, POOLED_MAX_GAP_GRACE_MINUTES, POOLED_MAX_GAP_RATIO, POOLED_MAX_GAP_TYPICAL_RATIO, type StopSharers } from './stopPools.js';
import type { DirectionStretches, Stretch } from './tripSets.js';

export { PIECE_PARAMS } from './pieceParams.js';
import { PIECE_PARAMS } from './pieceParams.js';

export type PieceKind = 'trunk' | 'branch' | 'shortTurn';

/** owner pattern (memberKey) -> station key -> the other patterns pooled into the owner's departures there. May be asymmetric. */
export type PiecePools = ReadonlyMap<string, StopSharers>;

export interface Piece {
  kind: PieceKind;
  /** Travel order. */
  stops: readonly string[];
  lengthKm: number;
  /** The stop the piece is read at (the middle stop of the stretch). */
  refStop: string;
  /** Trips serving refStop. */
  tripCount: number;
  /** The stretch this piece was built from, so the existing readings stay reachable. */
  stretch: Stretch;
  /** Asymmetric pools of the patterns that run the piece, when known. */
  pools?: PiecePools;
}

/** Per pattern of one route direction and day, the patterns pooled at each station. Same answer as computeStopSharers. */
export function patternPools(
  patterns: readonly SharedStretchPattern[],
  stopsById: ReadonlyMap<string, { lat: number; lon: number }>,
  parentOf: ReadonlyMap<string, string>,
): PiecePools {
  return computeStopSharers(patterns, stopsById, parentOf);
}

/** Who is pooled into `owner`'s departures at `station`: asymmetric, so poolAt(a, s) can differ from the reverse. */
export function poolAt(pools: PiecePools, owner: string, station: string): ReadonlySet<string> {
  return pools.get(owner)?.get(station) ?? new Set<string>();
}

/** A trunk shorter than a branch may be (PIECE_PARAMS.minStops stops, minKm km) has no trunk value (CIV-1579). */
export function trunkLongEnough(main: Pick<Stretch, 'stops' | 'lengthKm'>): boolean {
  return main.stops.length >= PIECE_PARAMS.minStops && main.lengthKm >= PIECE_PARAMS.minKm;
}

/** The direction's trunk and its branches as pieces, trunk first. Short-turn segments are today's branches and pools; no separate state is read. */
export function directionPieces(d: Pick<DirectionStretches, 'main' | 'tails'>, pools?: PiecePools): Piece[] {
  const of = (kind: PieceKind, s: Stretch): Piece => ({ kind, stops: s.stops, lengthKm: s.lengthKm, refStop: s.refStop, tripCount: s.tripCount, stretch: s, pools });
  return [...(d.main ? [of('trunk', d.main)] : []), ...d.tails.map(t => of('branch', t))];
}

/** True when this process was started with ATLAS_HEADLINE_FROM_TRUNK=1 (CIV-1959 B1). Off by default. */
export function headlineFromTrunkFromEnv(): boolean {
  return headlineFromTrunkEnabled(process.env.ATLAS_HEADLINE_FROM_TRUNK);
}

/**
 * CIV-1959 B1: the piece a direction's headline is read from, or null when there is no real shared core and the slowest
 * piece sets the headline as before (the hub fallback). No trunk when: the regular patterns share no stop (disconnected
 * pieces), the trunk is under the piece minimum (trunkLongEnough, kept until B4), or it is shorter than every branch it
 * feeds (a hub-and-spoke route: a 2-stop core is not what riders on a 12-stop spoke ride).
 */
export function headlineTrunk(d: Pick<DirectionStretches, 'main' | 'tails' | 'disconnected'>): Stretch | null {
  const main = d.main;
  if (!main || d.disconnected || !trunkLongEnough(main)) return null;
  if (d.tails.length > 0 && d.tails.every(t => main.stops.length < t.stops.length)) return null;
  return main;
}

/** True when this process was started with ATLAS_PIECE_READING=1 (CIV-1959 B2). Off by default. */
export function pieceReadingFromEnv(): boolean {
  return pieceReadingEnabled(process.env.ATLAS_PIECE_READING);
}

// ---------------------------------------------------------------------------------------------------------------------
// CIV-1959 B2: one reading per piece, with Arm A (drift tolerance).
//
// A piece here is a run of consecutive drawn stops that the same set of patterns pools at (today's boundaries, the
// computeStopSharers view; stops no other pattern pools at are not in a piece). Each piece gets one reading per period,
// read from the stops' own pooled lists (the ladder below; the median of the stops' own readings). Arm A (Ryan: "Then we should ignore the 16"):
// a stop takes the piece reading only if (i) its own reading, read the same way with that stop as the reference, is at most
// one public tier worse than the piece value and (ii) its own list passes the evenness test against the piece value; every
// other stop breaks off with its own reading. A stop that takes the piece reading although its own reading differs is
// IGNORED for the piece, never overwritten (Ryan: "Not overwrite it but ignore it"): its own published value stays.
// Overnight is not read (CIV-1764 is not landed).
// ---------------------------------------------------------------------------------------------------------------------

/** The periods a piece is read in: every daytime period and late (overnight stays on the night verdict). */
export const PIECE_READING_PERIODS = ['amPeak', 'midday', 'pmPeak', 'evening', 'late'] as const satisfies readonly PeriodKey[];

/** Public tier index of a headway (PUBLIC_TIER_MAXES order, 5 and 8 count as 10; past the last is the infrequent step). */
const publicTierIndex = (value: number): number => {
  const i = PUBLIC_TIER_MAXES.findIndex(max => value <= max);
  return i < 0 ? PUBLIC_TIER_MAXES.length : i;
};

const gapsOf = (list: readonly number[]): number[] => list.slice(1).map((t, i) => t - list[i]);

/** The pooled evenness test of stopPools (mean ratio and value ratio, each with the grace) on an in-window list, against `value`. */
export function listIsEvenAgainst(list: readonly number[], value: number): boolean {
  if (list.length < 2) return false;
  const mean = (list[list.length - 1] - list[0]) / (list.length - 1);
  const longest = Math.max(...gapsOf(list));
  return !(longest > Math.max(POOLED_MAX_GAP_RATIO * mean, Math.round(mean) + POOLED_MAX_GAP_GRACE_MINUTES)
    || longest > Math.max(POOLED_MAX_GAP_TYPICAL_RATIO * value, value + POOLED_MAX_GAP_GRACE_MINUTES));
}

const runsThroughWindow = (list: readonly number[], start: number, end: number): boolean => {
  const mid = (start + end) / 2;
  return list.some(t => t < mid) && list.some(t => t >= mid);
};

/** A member pattern's own reading of a window: its list, 3+ departures, steady by the settled 15 min / 1.7x test. */
function memberReading(list: readonly number[] | undefined, start: number, end: number) {
  if (!list) return null;
  const w = collapseBunched(departuresInWindow(list, start, end, true));
  if (w.length < 3) return null;
  const typical = medianHeadwayInWindow(w, start, end, 3, true);
  if (typical == null) return null;
  const mean = (w[w.length - 1] - w[0]) / (w.length - 1);
  return { value: Math.max(typical, Math.round(mean)), steady: isSteadyPeriodGaps(gapsOf(w), typical), through: runsThroughWindow(w, start, end) };
}

export interface PieceReadContext {
  /** The feature's drawn stops, in order. */
  order: readonly string[];
  station: (stopId: string) => string;
  /** The owning pattern's pools: station key -> the other patterns pooled into its departures there. */
  sharersAt: StopSharers | undefined;
  /** The pooled departure list at each stop (what today's published stop values read). */
  pooledMap: ReadonlyMap<string, readonly number[]>;
  /** Stops where another pattern really contributed. */
  pooledStops: ReadonlySet<string>;
  /** The drawn pattern's own list at each stop. */
  own: ReadonlyMap<string, readonly number[]>;
  /** Another pattern's departures by stop. */
  memberDeps: (memberKey: string) => ReadonlyMap<string, readonly number[]> | undefined;
}

export interface PieceRead {
  /** 0: no reading (under 3 departures, or none on both sides of the period's midpoint); 1: even; 3: uneven, a steady member sets it; 4: the longest gap. */
  step: 0 | 1 | 3 | 4;
  value: number | null;
  /** The in-window list read (bunched departures collapsed). */
  list: readonly number[];
}

/**
 * One reading of `stops` in a period window, read at stops[refIdx]. The ladder (Evolve design, step 2 dropped): step 1 even
 * list reads max(typical, mean) capped by the best qualifying member's own value; step 3 not even but a steady member runs
 * through the period reads min(that member's value, the longest gap); step 4 reads the longest gap.
 */
export function readPieceAt(ctx: PieceReadContext, stops: readonly string[], refIdx: number, start: number, end: number): PieceRead {
  const ref = stops[refIdx];
  const w = collapseBunched(departuresInWindow([...(ctx.pooledMap.get(ref) ?? [])], start, end, true));
  if (w.length < 3 || !runsThroughWindow(w, start, end)) return { step: 0, value: null, list: w };
  const typical = medianHeadwayInWindow(w, start, end, 3, true);
  if (typical == null) return { step: 0, value: null, list: w };
  const mean = (w[w.length - 1] - w[0]) / (w.length - 1);
  const longest = Math.max(...gapsOf(w));
  // Members: the owning pattern and every pooled pattern that serves the whole piece, with 3+ departures here.
  const members: NonNullable<ReturnType<typeof memberReading>>[] = [];
  const ownR = memberReading(ctx.own.get(ref), start, end);
  if (ownR) members.push(ownR);
  for (const key of ctx.sharersAt?.get(ctx.station(ref)) ?? []) {
    const deps = ctx.memberDeps(key);
    if (!deps || !stops.every(s => deps.has(s))) continue;
    const r = memberReading(deps.get(ref), start, end);
    if (r) members.push(r);
  }
  const steady = members.filter(m => m.steady);
  const cap = steady.length ? Math.min(...steady.map(m => m.value)) : null;
  const floored = Math.max(typical, Math.round(mean));
  const value = cap != null ? Math.min(floored, cap) : floored;
  if (listIsEvenAgainst(w, value)) return { step: 1, value, list: w };
  const through = members.filter(m => m.steady && m.through);
  if (through.length) return { step: 3, value: Math.min(Math.min(...through.map(m => m.value)), longest), list: w };
  return { step: 4, value: longest, list: w };
}

/**
 * Arm A's test: whether a stop takes the piece's reading. Its own reading must exist (3+ departures), be at most one public
 * tier worse than the piece value, and its own list must pass the evenness test against the piece value.
 */
export function armAKeeps(own: PieceRead, pieceValue: number): boolean {
  return own.step !== 0 && own.value != null && own.list.length >= 3
    && publicTierIndex(own.value) - publicTierIndex(pieceValue) <= 1
    && listIsEvenAgainst(own.list, pieceValue);
}

/** Pieces on today's boundaries: runs of consecutive pooled stops with the same sharer set. Stops nothing pools at are in none. */
export function sharerPieces(ctx: Pick<PieceReadContext, 'order' | 'station' | 'sharersAt' | 'pooledStops'>): string[][] {
  const keyOf = (stopId: string) => (ctx.pooledStops.has(stopId) ? [...(ctx.sharersAt?.get(ctx.station(stopId)) ?? [])].sort().join('+') : '');
  const pieces: string[][] = [];
  let last = '';
  for (const stopId of ctx.order) {
    const key = keyOf(stopId);
    if (!key) { last = ''; continue; }
    if (key === last) pieces[pieces.length - 1].push(stopId);
    else { pieces.push([stopId]); last = key; }
  }
  return pieces;
}

export interface PieceCell {
  stop: string;
  period: PeriodKey;
  /** The piece's one reading in the period. */
  pieceValue: number;
  step: 1 | 3 | 4;
  /** Arm A: the stop takes the piece reading. False: it breaks off and shows its own. */
  kept: boolean;
  /** The stop's own reading (the ladder read with this stop as the reference), null when it has none. */
  ownReading: number | null;
  /** Number of stops in the piece. */
  pieceStops: number;
}

/**
 * Every stop-period of every read piece of one drawn line, with the piece reading and Arm A's decision.
 *
 * The piece reading is the MEDIAN of the stops' own readings (the ladder read with each stop as the reference; stops with no
 * reading do not vote), the upper median when the count is even. A single drifting stop (a 16 among 15s) can never be the
 * median of three or more readings unless most of the piece drifts with it, so it cannot set the piece, wherever it sits in
 * the stop order (a middle-stop reference could pick it: TTC 96). The upper median is the tie-break because overstating
 * service is worse than understating it; it is deterministic. The ladder step reported is the step of the first stop (in
 * travel order) whose own reading equals the median. Arm A then decides, stop by stop, who takes it.
 */
export function readFeaturePieces(ctx: PieceReadContext): PieceCell[] {
  const cells: PieceCell[] = [];
  for (const stops of sharerPieces(ctx)) {
    for (const period of PIECE_READING_PERIODS) {
      const { start, end } = PERIOD_MINUTES[period];
      const owns = stops.map((_, i) => readPieceAt(ctx, stops, i, start, end));
      const voters = owns.filter(o => o.step !== 0 && o.value != null);
      if (voters.length === 0) continue;
      const sorted = voters.map(o => o.value!).sort((a, b) => a - b);
      const pieceValue = sorted[Math.floor(sorted.length / 2)];
      const step = voters.find(o => o.value === pieceValue)!.step as 1 | 3 | 4;
      stops.forEach((stop, i) => {
        const own = owns[i];
        cells.push({ stop, period, pieceValue, step, kept: armAKeeps(own, pieceValue), ownReading: own.step !== 0 ? own.value : null, pieceStops: stops.length });
      });
    }
  }
  return cells;
}

/**
 * The piece readings to publish (`piecePeriodHeadways`): per stop and period, the piece reading where the stop takes it and
 * its published own value differs. A stop that breaks off, has no published value, or already reads the piece value gets no
 * entry, so the map reads its own published value there. Never changes a stop's own published value.
 */
export function pieceReadingOverlay(
  cells: readonly PieceCell[],
  published: Readonly<Record<string, Partial<Record<PeriodKey, number>>>>,
): Record<string, Partial<Record<PeriodKey, number>>> {
  const out: Record<string, Partial<Record<PeriodKey, number>>> = {};
  for (const c of cells) {
    const own = published[c.stop]?.[c.period];
    if (!c.kept || own == null || own === c.pieceValue) continue;
    (out[c.stop] ??= {})[c.period] = c.pieceValue;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// CIV-1959 B3: what each piece of a direction shows in each period (behind ATLAS_BRANCH_READINGS=1, off by default).
//
// Rule D (the #1086 branch-definition investigation, comment 7022580375), read on today's trunk and branches (B4 changes the
// boundaries): a piece reads in a period when its own trips are at least HEADLINE_MIN_DEPARTURES, evenly spaced, and cover at
// least half the period. The order of the treatments, first match wins:
//   1. no trips in the period                          -> no entry
//   2. under 3 trips, or not evenly spaced             -> limited trips (no number, never sets a headline)
//   3. covers under half the period                    -> limited trips
//   4. 3+ even trips, covers half or more, but one edge wait is long (it stops or starts inside the period) -> tail:
//      "every N until HH:MM" with its full-window wait as the value (RTD 15 Saturday midday: every 30 until 12:16, wait 164)
//   5. everything passes                               -> reading (trunk or branch)
// "Covers" counts the period from its start (or to its end) when the wait to the first (or from the last) trip is within the
// evenness allowance, so a run that begins a little after the period starts still covers it from the start.
// ---------------------------------------------------------------------------------------------------------------------

/** True when this process was started with ATLAS_BRANCH_READINGS=1 (CIV-1959 B3). Off by default. */
export function branchReadingsFromEnv(): boolean {
  return branchReadingsEnabled(process.env.ATLAS_BRANCH_READINGS);
}

/** Rule D's coverage floor: the share of the period a piece's trips must cover. Not yet approved by Ryan (needs his word-for-word OK before the flag goes on). */
export const PIECE_MIN_PERIOD_COVER = 0.5;

/**
 * One piece's treatment in one period window, from its departures at its reference stop (GTFS minutes). Null when it has no trip
 * in the window. `readingValue` is the value a full reading publishes (the stretch's own filter value, so the trunk row and the
 * headline are one calculation); without it the piece's typical spacing is used.
 */
export function classifyPiecePeriod(times: readonly number[], start: number, end: number, readingValue?: number | null): PieceTreatment | null {
  const t = departuresInWindow(times, start, end, false);
  if (t.length === 0) return null;
  if (t.length < HEADLINE_MIN_DEPARTURES) return { t: 'limited' };
  const typical = medianHeadwayInWindow(t, start, end, HEADLINE_MIN_DEPARTURES, true);
  if (typical == null || typical <= 0) return { t: 'limited' };
  const gaps = gapsOf(t);
  const mean = (t[t.length - 1] - t[0]) / (t.length - 1);
  const inner = Math.max(...gaps);
  // Evenly spaced: the existing 1.75 x mean with the 5-minute grace (the pooled test's first clause; its 1.6 x value clause is a
  // second test on a reading and does not apply to a piece with no value yet).
  if (inner > Math.max(POOLED_MAX_GAP_RATIO * mean, Math.round(mean) + POOLED_MAX_GAP_GRACE_MINUTES)) return { t: 'limited' };
  const every = Math.max(typical, Math.round(mean));
  const allowance = Math.max(POOLED_MAX_GAP_RATIO * every, every + POOLED_MAX_GAP_GRACE_MINUTES);
  const lead = t[0] - start;
  const trail = end - t[t.length - 1];
  const leadOk = lead <= allowance;
  const trailOk = trail <= allowance;
  const covered = ((trailOk ? end : t[t.length - 1]) - (leadOk ? start : t[0])) / (end - start);
  if (covered < PIECE_MIN_PERIOD_COVER) return { t: 'limited' };
  if (leadOk && trailOk) return { t: 'reading', v: readingValue ?? every };
  return {
    t: 'tail',
    v: Math.ceil(Math.max(lead, inner, trail)),
    every,
    ...(leadOk ? {} : { from: t[0] }),
    ...(trailOk ? {} : { until: t[t.length - 1] }),
  };
}

/**
 * A direction's pieces and their treatment in every read period (PIECE_READING_PERIODS; overnight keeps the night verdict).
 * `stretchValue` gives a stretch's own filter value in a period, so a full reading is the number the card already reads.
 * Only pieces with at least one period entry are kept; null when none has, so a direction with nothing to say gets no field.
 */
export function directionPieceReadings(
  d: Pick<DirectionStretches, 'main' | 'tails'>,
  stretchValue: (stretch: Stretch, period: PeriodKey) => number | null,
): PieceReadings | null {
  const entry = (kind: 'trunk' | 'branch', index: number, s: Stretch): PieceReadingEntry => {
    const periods: PieceReadingEntry['periods'] = {};
    for (const key of PIECE_READING_PERIODS) {
      const { start, end } = PERIOD_MINUTES[key];
      const treatment = classifyPiecePeriod(s.times, start, end, stretchValue(s, key));
      if (treatment) periods[key] = treatment;
    }
    return { kind, index, stopCount: s.stops.length, refStop: s.refStop, periods };
  };
  const pieces = [
    ...(d.main ? [entry('trunk', 0, d.main)] : []),
    ...d.tails.map((t, i) => entry('branch', i, t)),
  ];
  return pieces.some(p => Object.keys(p.periods).length > 0) ? { pieces } : null;
}

/** The readings with each piece's stop list kept only where `own` says this feature stands for the piece (the file carries each list once per feature of its slot). */
export function pieceReadingsForFeature(readings: PieceReadings, d: Pick<DirectionStretches, 'main' | 'tails'>, role: 'main' | 'tail' | 'variant' | undefined, index: number | undefined): PieceReadings {
  return {
    pieces: readings.pieces.map(p => {
      const own = p.kind === 'trunk' ? role === 'main' : role === 'tail' && index === p.index;
      const stops = p.kind === 'trunk' ? d.main?.stops : d.tails[p.index]?.stops;
      return own && stops ? { ...p, stops: [...stops] } : p;
    }),
  };
}
