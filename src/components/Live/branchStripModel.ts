/**
 * The branch-aware route strip's rules, apart from the drawing so they can be tested: which stops every regular pattern
 * shares (the trunk), what each pattern does before and after it (the forks), and the stop figures for every stop on
 * any of them. Patterns come from the analysis file's `v3.patterns`; a route with one pattern, or patterns that do not
 * share one unbroken run of stops, has no branch model and keeps the straight strip.
 */
import type { DashboardBand, LiveV3, UncertainStart } from '../../../shared/liveDashboard';
import { routeStripFromV3, type RouteStripDirection, type RouteStripStop, type RouteStripStretch } from './routeStripModel';
import { titleCase } from '../../utils/format';

/** A stop that ends a pattern, to be named where it ends. `row` is the fork's row (0 is the trunk's own line). */
export interface BranchEnd {
  stop: RouteStripStop;
  side: 'start' | 'end';
  row: number;
  /** The stop is on the shared trunk (a pattern stops there), so it is named under the lines, not above a fork. */
  onTrunk: boolean;
}

export interface BranchModel {
  directionId: number;
  label: string;
  /** Stops every regular pattern serves, in route order. */
  trunk: RouteStripStop[];
  /** What patterns do before the trunk: one list per different lead-in (the main pattern's first), each in route order. */
  starts: RouteStripStop[][];
  /** What patterns do after the trunk: one list per different lead-out (the main pattern's first). */
  ends: RouteStripStop[][];
  /** The stops where patterns begin and end, so each branch is named by its end stop. */
  endLabels: BranchEnd[];
  delaysStart: RouteStripStretch | null;
  bunchingForms: RouteStripStretch | null;
}

/** The longest run of `ids` (in order) where every id is in all of `others` and the run is unbroken in each of them. */
export function sharedRun(ids: readonly string[], others: ReadonlyArray<readonly string[]>): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  const inAll = (id: string) => others.every(o => o.includes(id));
  let i = 0;
  while (i < ids.length) {
    if (!inAll(ids[i])) { i++; continue; }
    let j = i;
    while (j + 1 < ids.length && inAll(ids[j + 1]) && others.every(o => o.indexOf(ids[j + 1]) === o.indexOf(ids[j]) + 1)) j++;
    if (!best || j - i > best.to - best.from) best = { from: i, to: j };
    i = j + 1;
  }
  return best;
}

/**
 * The trunk and forks of one direction, from its regular patterns (main first). `stopFor` gives the figures for a stop.
 * Null when there is nothing to fork: one pattern, no shared run, or every pattern's lead-ins and lead-outs are empty.
 */
export function branchesOf(
  patterns: ReadonlyArray<{ stops: ReadonlyArray<{ stopId: string; name: string }> }>,
  stopFor: (s: { stopId: string; name: string }) => RouteStripStop,
): Pick<BranchModel, 'trunk' | 'starts' | 'ends' | 'endLabels'> | null {
  if (patterns.length < 2) return null;
  const ids = patterns.map(p => p.stops.map(s => s.stopId));
  const run = sharedRun(ids[0], ids);
  if (!run) return null;
  const firstId = ids[0][run.from], lastId = ids[0][run.to];
  // Where the run sits in each pattern.
  const cuts = ids.map(list => ({ from: list.indexOf(firstId), to: list.indexOf(lastId) }));
  const trunk = patterns[0].stops.slice(run.from, run.to + 1).map(stopFor);
  const unique = (lists: RouteStripStop[][]) => {
    const seen = new Set<string>();
    return lists.filter(l => { const k = l.map(s => s.stopId).join('>'); if (!l.length || seen.has(k)) return false; seen.add(k); return true; });
  };
  const leads = patterns.map((p, k) => p.stops.slice(0, cuts[k].from).map(stopFor));
  const tails = patterns.map((p, k) => p.stops.slice(cuts[k].to + 1).map(stopFor));
  const starts = unique(leads), ends = unique(tails);
  if (!starts.length && !ends.length) return null;
  // Name each pattern's two end stops once; a fork's end sits on that fork's row, a trunk end on row 0.
  const endLabels: BranchEnd[] = [];
  const add = (stop: RouteStripStop, side: 'start' | 'end', row: number, onTrunk = false) => {
    if (!endLabels.some(e => e.stop.stopId === stop.stopId && e.side === side)) endLabels.push({ stop, side, row, onTrunk });
  };
  const keyOf = (l: RouteStripStop[]) => l.map(s => s.stopId).join('>');
  patterns.forEach((_, k) => {
    const lead = leads[k], tail = tails[k];
    if (lead.length) add(lead[0], 'start', Math.max(0, starts.findIndex(f => keyOf(f) === keyOf(lead))));
    else add(trunk[0], 'start', 0, true);
    if (tail.length) add(tail[tail.length - 1], 'end', Math.max(0, ends.findIndex(f => keyOf(f) === keyOf(tail))));
    else add(trunk[trunk.length - 1], 'end', 0, true);
  });
  return { trunk, starts, ends, endLabels };
}

/**
 * One direction with its branches, for one time of day. Stops on any regular pattern get their figures from the analysis'
 * stop list; bunching is only measured along the main pattern, so branch stops have none ("not measured").
 */
export function branchStripFromV3(v3: LiveV3, directionId: number, band: DashboardBand = 'all', uncertain: readonly UncertainStart[] = []): BranchModel | null {
  const patterns = v3.patterns?.[String(directionId)];
  if (!patterns || patterns.length < 2) return null;
  const straight: RouteStripDirection = routeStripFromV3(v3, directionId, band, uncertain);
  const bandData = v3.bands?.[band] ?? { stops: v3.stops, buildup: v3.buildup };
  const lessExact = uncertain.find(u => u.directionId === directionId)?.stops ?? 0;
  const byId = new Map(bandData.stops.filter(s => s.directionId === directionId).map(s => [s.stopId, s]));
  const mainById = new Map(straight.stops.map(s => [s.stopId, s]));
  const stopFor = (s: { stopId: string; name: string }): RouteStripStop => {
    const main = mainById.get(s.stopId);
    if (main) return main;
    const st = byId.get(s.stopId);
    return {
      stopId: s.stopId,
      name: titleCase(s.name),
      delayMin: st && st.n > 0 ? st.medianMin : null,
      lateShare: st && st.n > 0 ? st.lateShare : null,
      bunchingShare: null,
      n: st?.n ?? 0,
      bunchingN: 0,
      uncertain: !!st && st.order >= 0 && st.order < lessExact,
      timepoint: st?.timepoint,
    };
  };
  const found = branchesOf(patterns, stopFor);
  if (!found) return null;
  return { directionId, label: straight.label, ...found, delaysStart: straight.delaysStart, bunchingForms: straight.bunchingForms };
}

/** Every stop of a model, trunk and forks, in drawing order. */
export function allBranchStops(m: BranchModel): RouteStripStop[] {
  const seen = new Set<string>();
  return [...m.starts.flat(), ...m.trunk, ...m.ends.flat()].filter(s => !seen.has(s.stopId) && seen.add(s.stopId));
}
