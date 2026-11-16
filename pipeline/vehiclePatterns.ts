/**
 * CIV-1685: buses needed per service pattern (branches, short turns, interlined routes, layovers).
 *
 * Built on the trip runs of vehiclesNeeded.ts. Each run is one leg; a leg is a route, direction,
 * first stop and last stop. The time a bus spends on a leg is its running time (first to last stop)
 * plus the layover after it: the gap until the same block's next departure, whichever route that
 * departure is on, so an interlined block keeps its layover instead of being cut at the switch.
 * A gap longer than MAX_LAYOVER_MIN is a lay-up or a pull-in, not layover, and is left out.
 *
 * A pattern is a round trip: a leg paired with its return leg (reversed terminals, or the leg the
 * blocks most often run next), or a loop (one leg that ends where it starts). Its cycle is the sum
 * of its legs' median running time and median layover. The planner can replace the schedule's
 * layover with a recovery rule (a share of running time, or minutes per leg).
 *
 * Pattern structure reuses the pipeline's shared-stretch rule (sharedStretch.ts): a pattern whose
 * stops lie in order inside a longer pattern of the same route is a short turn of it; two patterns
 * that share a qualifying stretch (SHARED_STRETCH_MIN_STOPS stops and SHARED_STRETCH_MIN_KM) and
 * each have stops of their own are branches, and the stretch they share is the trunk.
 *
 * Not in GTFS and never estimated: pull-out and pull-in between the garage and the first or last
 * stop. A deadhead between trips (next trip starts somewhere other than where the last ended) is
 * inside the gap the schedule gives, so it is counted as layover and flagged.
 */
import { alignedSharedRuns, qualifyingSharedRuns } from './sharedStretch.js';
import { concurrentAt, median, vehiclesForHeadway, type TripRun } from './vehiclesNeeded.js';

/** A gap between a block's trips longer than this is a lay-up or a garage trip, not layover. */
export const MAX_LAYOVER_MIN = 60;
/** Two stops this close (metres) are one terminal: the two sides of a loop, platforms of a station. */
export const SAME_PLACE_METRES = 250;
/** Block switches between two routes inside a period before they count as an interlined group. */
export const MIN_INTERLINE_SWITCHES = 4;
/** A pattern with fewer departures than this in the period is a partial trip (pull-out, pull-in, one-off). */
export const MIN_REGULAR_DEPARTURES = 3;

export interface Places {
  coords: ReadonlyMap<string, { lat: number; lon: number }>;
  parentOf?: ReadonlyMap<string, string>;
}

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * p) / 2) ** 2
    + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(((b.lon - a.lon) * p) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
}

/** Same stop, same parent station, or within SAME_PLACE_METRES. */
export function samePlace(a: string, b: string, places?: Places): boolean {
  if (a === b) return true;
  if (!places) return false;
  const pa = places.parentOf?.get(a) ?? a;
  const pb = places.parentOf?.get(b) ?? b;
  if (pa === pb) return true;
  const ca = places.coords.get(a);
  const cb = places.coords.get(b);
  return !!ca && !!cb && metres(ca, cb) <= SAME_PLACE_METRES;
}

/** What follows one run in its block. */
export interface RunLink {
  run: TripRun;
  next: TripRun | null;
  /** Minutes from this run's last stop to the block's next departure; null at the block's end or past MAX_LAYOVER_MIN. */
  layover: number | null;
  /** The block's next trip starts away from this run's last stop (time to get there is inside layover). */
  deadhead: boolean;
  /** The gap to the next trip is longer than MAX_LAYOVER_MIN. */
  longGap: boolean;
  /** First run of its block: the pull-out before it is not in the feed. */
  pullOut: boolean;
}

/** Every run with the block's next run, across routes (chains are not cut at route switches). */
export function linkRuns(runs: readonly TripRun[], places?: Places): Map<TripRun, RunLink> {
  const out = new Map<TripRun, RunLink>();
  const byBlock = new Map<string, TripRun[]>();
  for (const run of runs) {
    if (!run.blockId) {
      out.set(run, { run, next: null, layover: null, deadhead: false, longGap: false, pullOut: false });
      continue;
    }
    const list = byBlock.get(run.blockId) ?? [];
    list.push(run);
    byBlock.set(run.blockId, list);
  }
  for (const list of byBlock.values()) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    list.forEach((run, i) => {
      const next = list[i + 1] ?? null;
      const gap = next ? Math.max(0, next.start - run.end) : null;
      const longGap = gap != null && gap > MAX_LAYOVER_MIN;
      out.set(run, {
        run,
        next,
        layover: gap != null && !longGap ? gap : null,
        deadhead: !!next && !longGap && !samePlace(run.lastStop, next.firstStop, places),
        longGap,
        pullOut: i === 0,
      });
    });
  }
  return out;
}

export function legKey(run: TripRun): string {
  return `${run.routeId}|${run.directionId ?? ''}|${run.firstStop}|${run.lastStop}`;
}

export interface Leg {
  key: string;
  routeId: string;
  directionId: string | null;
  firstStop: string;
  lastStop: string;
  /** The leg's most common stop sequence (empty when runs carry no stops). */
  stopIds: readonly string[];
  /** Distinct stop sequences folded into this leg (a variant that skips or adds stops). */
  variants: number;
  departures: number;
  /** Departure times in the period, sorted. */
  starts: number[];
  runningMin: number;
  /** Median scheduled layover after the leg; null when no run of it has a block link. */
  layoverMin: number | null;
  layoverSamples: number;
  deadheads: number;
  longGaps: number;
  pullOuts: number;
  /** Runs whose block ends after them: the pull-in is not in the feed. */
  pullIns: number;
  /** Runs with no block_id (or frequencies.txt departures). */
  unblocked: number;
}

function legsOf(runs: readonly TripRun[], links: ReadonlyMap<TripRun, RunLink>): Leg[] {
  const groups = new Map<string, TripRun[]>();
  for (const run of runs) {
    const key = legKey(run);
    const list = groups.get(key) ?? [];
    list.push(run);
    groups.set(key, list);
  }
  const legs: Leg[] = [];
  for (const [key, list] of groups) {
    const seqCount = new Map<readonly string[], number>();
    for (const r of list) if (r.stopIds) seqCount.set(r.stopIds, (seqCount.get(r.stopIds) ?? 0) + 1);
    const topSeq = [...seqCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? [];
    const lk = list.map(r => links.get(r)!);
    const layovers = lk.map(l => l.layover).filter((v): v is number => v != null);
    const starts = list.map(r => r.start).sort((a, b) => a - b);
    legs.push({
      key,
      routeId: list[0].routeId,
      directionId: list[0].directionId,
      firstStop: list[0].firstStop,
      lastStop: list[0].lastStop,
      stopIds: topSeq,
      variants: seqCount.size,
      departures: list.length,
      starts,
      runningMin: median(list.map(r => r.end - r.start))!,
      layoverMin: median(layovers),
      layoverSamples: layovers.length,
      deadheads: lk.filter(l => l.deadhead).length,
      longGaps: lk.filter(l => l.longGap).length,
      pullOuts: lk.filter(l => l.pullOut).length,
      pullIns: lk.filter(l => l.run.blockId && !l.next).length,
      unblocked: list.filter(r => !r.blockId).length,
    });
  }
  return legs.sort((a, b) => b.departures - a.departures || a.key.localeCompare(b.key));
}

export type PatternRole = 'main' | 'branch' | 'short turn' | 'partial';

export interface Pattern {
  id: string;
  routeId: string;
  legs: Leg[];
  /** How the legs were paired. */
  pairedBy: 'terminals' | 'blocks' | 'loop' | 'one way';
  role: PatternRole;
  /** For a short turn: the pattern it runs inside. For a branch: the other branches it shares a trunk with. */
  relatedTo: string[];
  /** Round trips in the period (the legs' mean departures). */
  departures: number;
  /**
   * The schedule's own headway on this pattern, read in the middle half of the period (where
   * "scheduled now" is read, so a peak tail at the period's edge does not shorten it): those
   * minutes / departures of its busiest leg there. With fewer than two there, period minutes / departures.
   */
  headwayMin: number;
  runningMin: number;
  /** Scheduled layover, summed over legs; null when the feed has no blocks for it. */
  layoverMin: number | null;
  /** Buses on this pattern at the period's midpoint (block-based, or trips without blocks). */
  scheduledVehicles: number;
  scheduledBasis: 'blocks' | 'trips';
  /** Routes this pattern's blocks run on before or after it (an interlined group). */
  interlinedWith: string[];
  notes: string[];
}

export interface Trunk {
  routeId: string;
  branches: string[];
  /** Stops of the shared stretch, in the first branch's order. */
  stopIds: string[];
}

export interface InterlineGroup {
  routeIds: string[];
  /** Buses the group's regular patterns need at their own headways: sum of cycle / headway, rounded up once. */
  impliedVehicles: number;
  /** Block switches between the group's routes inside the period. */
  switches: number;
  /** Median minutes between two departures of the same block from the same origin, following blocks across the group's routes. */
  combinedCycleMin: number | null;
  cycleSamples: number;
  scheduledVehicles: number;
}

export interface PeriodPatterns {
  window: { start: number; end: number };
  patterns: Pattern[];
  trunks: Trunk[];
  interlines: InterlineGroup[];
}

/** Pair legs into round trips, per route. */
function pairLegs(legs: Leg[], runs: readonly TripRun[], links: ReadonlyMap<TripRun, RunLink>, places?: Places) {
  const byRoute = new Map<string, Leg[]>();
  for (const leg of legs) {
    const list = byRoute.get(leg.routeId) ?? [];
    list.push(leg);
    byRoute.set(leg.routeId, list);
  }
  // Same-route successor counts from blocks: leg key -> next leg key -> count.
  const successors = new Map<string, Map<string, number>>();
  for (const run of runs) {
    const next = links.get(run)?.next;
    if (!next || next.routeId !== run.routeId || links.get(run)!.longGap) continue;
    const m = successors.get(legKey(run)) ?? new Map<string, number>();
    m.set(legKey(next), (m.get(legKey(next)) ?? 0) + 1);
    successors.set(legKey(run), m);
  }
  const topSuccessor = (key: string): string | null => {
    const m = successors.get(key);
    if (!m) return null;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const out: Array<{ legs: Leg[]; pairedBy: Pattern['pairedBy'] }> = [];
  for (const routeLegs of byRoute.values()) {
    const used = new Set<string>();
    for (const leg of routeLegs) {
      if (used.has(leg.key)) continue;
      used.add(leg.key);
      if (samePlace(leg.firstStop, leg.lastStop, places)) {
        out.push({ legs: [leg], pairedBy: 'loop' });
        continue;
      }
      const free = routeLegs.filter(l => !used.has(l.key));
      const byTerminals = free
        .filter(l => samePlace(l.firstStop, leg.lastStop, places) && samePlace(l.lastStop, leg.firstStop, places))
        .sort((a, b) => Number(b.directionId !== leg.directionId) - Number(a.directionId !== leg.directionId) || b.departures - a.departures)[0];
      if (byTerminals) {
        used.add(byTerminals.key);
        out.push({ legs: [leg, byTerminals], pairedBy: 'terminals' });
        continue;
      }
      const succ = topSuccessor(leg.key);
      const byBlocks = succ ? free.find(l => l.key === succ && topSuccessor(l.key) === leg.key) : undefined;
      if (byBlocks) {
        used.add(byBlocks.key);
        out.push({ legs: [leg, byBlocks], pairedBy: 'blocks' });
        continue;
      }
      out.push({ legs: [leg], pairedBy: 'one way' });
    }
  }
  return out;
}

/** Stop keys for comparing patterns: parent station where there is one. */
function stationKeys(stopIds: readonly string[], places?: Places): string[] {
  return stopIds.map(id => places?.parentOf?.get(id) ?? id);
}

/** True when every stop of `short` (within 1 stop at each end) lies in order inside `long`. */
export function isInside(short: readonly string[], long: readonly string[]): boolean {
  if (short.length === 0 || short.length >= long.length) return false;
  const runs = alignedSharedRuns(short, long);
  return runs.some(([from, to]) => from <= 1 && to >= short.length - 2);
}

/** Leg of `p` compared with `q`: same direction where both have one, else the first leg. */
function comparableLegs(p: Pattern, q: Pattern): Array<[Leg, Leg]> {
  const pairs: Array<[Leg, Leg]> = [];
  for (const a of p.legs) {
    const b = q.legs.find(l => l.directionId != null && l.directionId === a.directionId) ?? q.legs[0];
    if (a.stopIds.length && b.stopIds.length) pairs.push([a, b]);
  }
  return pairs;
}

function classify(patterns: Pattern[], places?: Places): Trunk[] {
  const trunks: Trunk[] = [];
  const byRoute = new Map<string, Pattern[]>();
  for (const p of patterns) {
    if (p.departures < MIN_REGULAR_DEPARTURES) { p.role = 'partial'; continue; }
    const list = byRoute.get(p.routeId) ?? [];
    list.push(p);
    byRoute.set(p.routeId, list);
  }
  const coords = places?.coords ?? new Map<string, { lat: number; lon: number }>();
  for (const list of byRoute.values()) {
    const len = (p: Pattern) => Math.max(...p.legs.map(l => l.stopIds.length));
    for (const p of list) {
      for (const q of list) {
        if (p === q || len(p) >= len(q)) continue;
        const pairs = comparableLegs(p, q);
        if (pairs.length && pairs.every(([a, b]) => isInside(stationKeys(a.stopIds, places), stationKeys(b.stopIds, places)))) {
          p.role = 'short turn';
          p.relatedTo.push(q.id);
          break;
        }
      }
    }
    const full = list.filter(p => p.role !== 'short turn');
    for (let i = 0; i < full.length; i++) {
      for (let j = i + 1; j < full.length; j++) {
        const [a, b] = comparableLegs(full[i], full[j])[0] ?? [];
        if (!a || !b) continue;
        const ka = stationKeys(a.stopIds, places);
        const shared = qualifyingSharedRuns(ka, stationKeys(b.stopIds, places), coords, a.stopIds);
        if (shared.length === 0) continue;
        full[i].role = 'branch';
        full[j].role = 'branch';
        full[i].relatedTo.push(full[j].id);
        full[j].relatedTo.push(full[i].id);
        const longest = shared.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
        const stopIds = a.stopIds.slice(longest[0], longest[1] + 1) as string[];
        const existing = trunks.find(t => t.routeId === full[i].routeId && t.branches.includes(full[i].id));
        if (existing) {
          if (!existing.branches.includes(full[j].id)) existing.branches.push(full[j].id);
          // The trunk is the stretch every branch shares: keep the shorter.
          if (stopIds.length < existing.stopIds.length) existing.stopIds = stopIds;
        } else {
          trunks.push({ routeId: full[i].routeId, branches: [full[i].id, full[j].id], stopIds });
        }
      }
    }
  }
  return trunks;
}

/** Median minutes between departures of one block from the same origin, inside the window, following the block across `routes`. */
function groupCycle(runs: readonly TripRun[], routes: ReadonlySet<string>, window: { start: number; end: number }): number[] {
  const byBlock = new Map<string, TripRun[]>();
  for (const r of runs) {
    if (!r.blockId || !routes.has(r.routeId)) continue;
    const list = byBlock.get(r.blockId) ?? [];
    list.push(r);
    byBlock.set(r.blockId, list);
  }
  const samples: number[] = [];
  for (const list of byBlock.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length; i++) {
      if (list[i].start < window.start || list[i].start >= window.end) continue;
      const key = legKey(list[i]);
      const j = list.findIndex((r, k) => k > i && legKey(r) === key);
      // Only a block that visits another route of the group before returning is an interlined cycle.
      if (j > i && list.slice(i, j).some(r => r.routeId !== list[i].routeId)) samples.push(list[j].start - list[i].start);
    }
  }
  return samples;
}

/**
 * Runs with each route's terminal stops folded to one stop per place (samePlace), so a leg that
 * ends at another platform of the same terminal is the same leg, with its stop sequence a variant.
 */
export function canonicalTerminals(runs: readonly TripRun[], places?: Places): TripRun[] {
  if (!places) return [...runs];
  const reps = new Map<string, string[]>();
  const canon = new Map<string, string>();
  const of = (routeId: string, stop: string): string => {
    const key = `${routeId}|${stop}`;
    const hit = canon.get(key);
    if (hit) return hit;
    const list = reps.get(routeId) ?? [];
    const rep = list.find(r => samePlace(r, stop, places)) ?? stop;
    if (rep === stop) list.push(stop);
    reps.set(routeId, list);
    canon.set(key, rep);
    return rep;
  };
  return runs.map(r => {
    const firstStop = of(r.routeId, r.firstStop);
    const lastStop = of(r.routeId, r.lastStop);
    return firstStop === r.firstStop && lastStop === r.lastStop ? r : { ...r, firstStop, lastStop };
  });
}

/**
 * Patterns, trunks and interlined groups for one period on one day. `runs` are every route's runs
 * that day (with stopIds for structure); `places` lets terminals on opposite sides of a street or
 * platforms of one station count as one place.
 */
export function periodPatterns(
  dayRuns: readonly TripRun[],
  window: { start: number; end: number },
  places?: Places,
): PeriodPatterns {
  const runs = canonicalTerminals(dayRuns, places);
  const links = linkRuns(runs, places);
  const inWindow = runs.filter(r => r.start >= window.start && r.start < window.end);
  const legs = legsOf(inWindow, links);
  const paired = pairLegs(legs, inWindow, links, places);
  const minutes = window.end - window.start;
  const mid = (window.start + window.end) / 2;

  const central = { start: window.start + minutes / 4, end: window.end - minutes / 4 };
  const centralHeadway = (pl: Leg[]): number | null => {
    const n = Math.max(...pl.map(l => l.starts.filter(t => t >= central.start && t < central.end).length));
    return n >= 2 ? (central.end - central.start) / n : null;
  };
  const legPattern = new Map<string, string>();
  const patterns: Pattern[] = paired.map(({ legs: pl, pairedBy }, i) => {
    const id = `${pl[0].routeId}#${i + 1}`;
    for (const l of pl) legPattern.set(l.key, id);
    const departures = pl.reduce((s, l) => s + l.departures, 0) / pl.length;
    const layovers = pl.map(l => l.layoverMin);
    const notes: string[] = [];
    const variants = pl.reduce((s, l) => s + Math.max(0, l.variants - 1), 0);
    if (variants) notes.push(`${variants} stop variant${variants > 1 ? 's' : ''} folded in`);
    const deadheads = pl.reduce((s, l) => s + l.deadheads, 0);
    if (deadheads) notes.push(`${deadheads} deadhead${deadheads > 1 ? 's' : ''} inside layover`);
    const longGaps = pl.reduce((s, l) => s + l.longGaps, 0);
    if (longGaps) notes.push(`${longGaps} gap${longGaps > 1 ? 's' : ''} over ${MAX_LAYOVER_MIN} min left out`);
    if (pl.some(l => l.pullOuts || l.pullIns)) notes.push('pull-out/pull-in: not in feed');
    if (pl.some(l => l.unblocked === l.departures)) notes.push('no block data: layover not in feed');
    if (pairedBy === 'one way') notes.push('one way (no return leg in period)');
    return {
      id,
      routeId: pl[0].routeId,
      legs: pl,
      pairedBy,
      role: 'main',
      relatedTo: [],
      departures,
      headwayMin: centralHeadway(pl) ?? minutes / departures,
      runningMin: pl.reduce((s, l) => s + l.runningMin, 0),
      layoverMin: layovers.every(v => v != null) ? layovers.reduce((s, v) => s! + v!, 0) : null,
      scheduledVehicles: 0,
      scheduledBasis: pl.every(l => l.unblocked === l.departures) ? 'trips' : 'blocks',
      interlinedWith: [],
      notes,
    };
  });

  // Buses at the midpoint: each run holds its bus from its departure to the block's next departure.
  const intervalsByPattern = new Map<string, Array<[number, number]>>();
  for (const run of runs) {
    const id = legPattern.get(legKey(run));
    if (!id) continue;
    const link = links.get(run)!;
    const end = link.layover != null && link.next ? link.next.start : run.end;
    const list = intervalsByPattern.get(id) ?? [];
    list.push([run.start, end]);
    intervalsByPattern.set(id, list);
  }
  for (const p of patterns) p.scheduledVehicles = concurrentAt(intervalsByPattern.get(p.id) ?? [], mid);

  const trunks = classify(patterns, places);

  // Interlined groups: routes a block switches between inside the period.
  const switches = new Map<string, number>();
  for (const run of inWindow) {
    const link = links.get(run)!;
    if (!link.next || link.longGap || link.next.routeId === run.routeId) continue;
    const key = [run.routeId, link.next.routeId].sort().join('\u0000');
    switches.set(key, (switches.get(key) ?? 0) + 1);
  }
  const parent = new Map<string, string>();
  const find = (x: string): string => { while (parent.get(x) && parent.get(x) !== x) x = parent.get(x)!; return x; };
  const counted = new Map<string, number>();
  for (const [key, n] of switches) {
    if (n < MIN_INTERLINE_SWITCHES) continue;
    const [a, b] = key.split('\u0000');
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
    counted.set(key, n);
  }
  const groups = new Map<string, Set<string>>();
  for (const r of parent.keys()) {
    const root = find(r);
    const set = groups.get(root) ?? new Set<string>();
    set.add(r);
    groups.set(root, set);
  }
  const interlines: InterlineGroup[] = [...groups.values()].map(routes => {
    const samples = groupCycle(runs, routes, window);
    return {
      routeIds: [...routes].sort(),
      switches: [...counted.entries()].filter(([k]) => k.split('\u0000').every(r => routes.has(r))).reduce((s, [, n]) => s + n, 0),
      combinedCycleMin: median(samples),
      cycleSamples: samples.length,
      scheduledVehicles: patterns.filter(p => routes.has(p.routeId)).reduce((s, p) => s + p.scheduledVehicles, 0),
      impliedVehicles: Math.ceil(patterns
        .filter(p => routes.has(p.routeId) && p.role !== 'partial')
        .reduce((s, p) => s + cycleMin(p, { kind: 'schedule' }) / p.headwayMin, 0) - 1e-9),
    };
  });
  for (const g of interlines) {
    for (const p of patterns) if (g.routeIds.includes(p.routeId)) p.interlinedWith = g.routeIds.filter(r => r !== p.routeId);
  }

  return { window, patterns, trunks, interlines };
}

/** How layover is counted in the cycle: the schedule's own, a share of running time, or fixed minutes per leg. */
export type Recovery = { kind: 'schedule' } | { kind: 'percent'; value: number } | { kind: 'minutes'; value: number };

export function parseRecovery(text: string | undefined): Recovery {
  if (text == null || text === 'schedule') return { kind: 'schedule' };
  const m = /^(\d+(?:\.\d+)?)(%|min)?$/.exec(text.trim());
  if (!m) throw new Error('--recovery must be "schedule", a percent of running time (10%) or minutes per leg (8 or 8min)');
  return m[2] === '%' ? { kind: 'percent', value: Number(m[1]) } : { kind: 'minutes', value: Number(m[1]) };
}

/** Recovery minutes for a pattern's round trip under a rule; null when the schedule's layover is unknown. */
export function recoveryMin(p: Pattern, rule: Recovery): number | null {
  if (rule.kind === 'percent') return (p.runningMin * rule.value) / 100;
  if (rule.kind === 'minutes') return rule.value * p.legs.length;
  return p.layoverMin;
}

/** Cycle under a recovery rule; with no schedule layover the running time alone (a floor). */
export function cycleMin(p: Pattern, rule: Recovery): number {
  return p.runningMin + (recoveryMin(p, rule) ?? 0);
}

export interface TargetOptions {
  /** Minutes between buses the planner wants. */
  headwayMin: number;
  /** 'trunk': the headway is on the shared middle (branches split it); 'branch': each branch gets it. */
  appliesTo: 'trunk' | 'branch';
  /** How trunk service is shared out among branches: each branch's current share of trips, or evenly. */
  branchSplit: 'current' | 'even';
  /** Headway for short-turn patterns; null keeps their current headway. */
  shortTurnHeadwayMin: number | null;
  recovery: Recovery;
}

export interface PatternTarget {
  id: string;
  headwayMin: number | null;
  vehicles: number | null;
  /** How the headway was chosen, in plain words. */
  basis: string;
}

/**
 * Buses per pattern at a target headway. Partial patterns (pull-outs, one-offs) get none.
 * Trunk mode: the branches together run every `headwayMin` on the shared middle, each at
 * headwayMin / share (share per `branchSplit`). A route with one full pattern runs it at headwayMin.
 */
export function targetVehicles(patterns: readonly Pattern[], trunks: readonly Trunk[], opts: TargetOptions): PatternTarget[] {
  const out: PatternTarget[] = [];
  const trunkOf = (p: Pattern) => trunks.find(t => t.branches.includes(p.id));
  for (const p of patterns) {
    const cycle = cycleMin(p, opts.recovery);
    if (p.role === 'partial') { out.push({ id: p.id, headwayMin: null, vehicles: null, basis: 'partial trips, not planned' }); continue; }
    if (p.role === 'short turn') {
      const hw = opts.shortTurnHeadwayMin ?? p.headwayMin;
      out.push({ id: p.id, headwayMin: hw, vehicles: vehiclesForHeadway(cycle, hw), basis: opts.shortTurnHeadwayMin != null ? 'short-turn headway' : 'short turn kept at current headway' });
      continue;
    }
    const trunk = trunkOf(p);
    if (!trunk || opts.appliesTo === 'branch') {
      out.push({ id: p.id, headwayMin: opts.headwayMin, vehicles: vehiclesForHeadway(cycle, opts.headwayMin), basis: trunk ? 'target on each branch' : 'target on the route' });
      continue;
    }
    const branches = patterns.filter(q => trunk.branches.includes(q.id));
    const total = branches.reduce((s, q) => s + q.departures, 0);
    const share = opts.branchSplit === 'even' ? 1 / branches.length : p.departures / total;
    const hw = opts.headwayMin / share;
    out.push({ id: p.id, headwayMin: hw, vehicles: vehiclesForHeadway(cycle, hw), basis: `target on shared middle, ${Math.round(share * 100)}% of trips (${opts.branchSplit} split)` });
  }
  return out;
}
