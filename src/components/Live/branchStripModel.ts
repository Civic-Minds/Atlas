/**
 * The branch-aware route strip's rules, apart from the drawing so they can be tested: which stops every regular pattern
 * shares (the trunk), what each pattern does before and after it (the forks), and the stop figures for every stop on
 * any of them. Patterns come from the analysis file's `v3.patterns`; a route with one pattern, or patterns that do not
 * share one unbroken run of stops, has no branch model and keeps the straight strip.
 */
import type { DashboardBand, LiveV3, UncertainStart } from '../../../shared/liveDashboard';
import { routeStripFromV3, type RouteStripDirection, type RouteStripStop, type RouteStripStretch } from './routeStripModel';
import { nameCase } from '../../utils/format';

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
  /** Every regular pattern as its own line of stops in route order (the main pattern first), for the stacked strip. */
  lines: RouteStripStop[][];
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
): Pick<BranchModel, 'trunk' | 'starts' | 'ends' | 'endLabels' | 'lines'> | null {
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
  const seenLines = new Set<string>();
  const lines = patterns.map(p => p.stops.map(stopFor)).filter(l => { const k = keyOf(l); if (seenLines.has(k)) return false; seenLines.add(k); return true; });
  return { trunk, starts, ends, endLabels, lines };
}

/**
 * The columns of the stacked strip: every distinct stop gets one column, in route order, so a stop several lines share
 * sits in the same column on each. A stop a line does not serve leaves its column empty on that line.
 */
export function columnsOf(lines: ReadonlyArray<ReadonlyArray<{ stopId: string }>>): string[] {
  const cols: string[] = [];
  for (const line of lines) {
    let pos = -1;
    for (const s of line) {
      const at = cols.indexOf(s.stopId);
      if (at >= 0) { pos = at; continue; }
      cols.splice(pos + 1, 0, s.stopId);
      pos += 1;
    }
  }
  return cols;
}

/**
 * One direction with its branches, for one time of day. Stops on any regular pattern get their figures from the analysis'
 * stop list; bunching for branch-only stops comes from the band's `branchStops` (gap figures only, no forms).
 */
export function branchStripFromV3(v3: LiveV3, directionId: number, band: DashboardBand = 'all', uncertain: readonly UncertainStart[] = []): BranchModel | null {
  const patterns = v3.patterns?.[String(directionId)];
  if (!patterns || patterns.length < 2) return null;
  const straight: RouteStripDirection = routeStripFromV3(v3, directionId, band, uncertain);
  const bandData = v3.bands?.[band] ?? { stops: v3.stops, buildup: v3.buildup };
  const lessExact = uncertain.find(u => u.directionId === directionId)?.stops ?? 0;
  const byId = new Map(bandData.stops.filter(s => s.directionId === directionId).map(s => [s.stopId, s]));
  // Gap figures by stop: the main pattern's own list and the branch-only stops. A main-pattern stop with no delay figures
  // (a terminal nobody departs from) still has gaps, so it is looked up here too, not only on the delay list.
  const bandBunching = v3.bunching.find(b => b.directionId === directionId)?.bands[band];
  const branchBunching = new Map([...(bandBunching?.stops ?? []), ...(bandBunching?.branchStops ?? [])].map(s => [s.stopId, s]));
  const mainById = new Map(straight.stops.map(s => [s.stopId, s]));
  const stopFor = (s: { stopId: string; name: string }): RouteStripStop => {
    const main = mainById.get(s.stopId);
    if (main) return main;
    const st = byId.get(s.stopId);
    const b = branchBunching.get(s.stopId);
    return {
      stopId: s.stopId,
      name: nameCase(s.name, 'stop'),
      delayMin: st && st.n > 0 ? st.medianMin : null,
      lateShare: st && st.n > 0 ? st.lateShare : null,
      bunchingShare: b && b.n > 0 ? b.badShare : null,
      bunchedShare: b && b.n > 0 ? b.bunchedShare : null,
      gappedShare: b && b.n > 0 ? b.gappedShare : null,
      n: st?.n ?? 0,
      bunchingN: b?.n ?? 0,
      uncertain: !!st && st.order >= 0 && st.order < lessExact,
      timepoint: st?.timepoint,
    };
  };
  const found = branchesOf(patterns, stopFor);
  if (!found) return null;
  return { directionId, label: straight.label, ...found, delaysStart: straight.delaysStart, bunchingForms: straight.bunchingForms };
}

/** One part of the phone strip: a lead-in branch, the shared line, or a lead-out branch. `terminal` is the row of the branch's end stop (-1 for the trunk). */
export interface PhoneSection { key: string; branch: boolean; terminal: number; stops: RouteStripStop[] }

/**
 * The phone strip's parts, top to bottom: lead-in branches, the shared line, lead-out branches. The main pattern's own
 * lead-in sits next to the trunk and its lead-out right after it, so the main line (where the marked stretch is
 * measured) runs unbroken down the strip and a bracket over it never passes another branch's rows.
 */
export function phoneSections(model: BranchModel): PhoneSection[] {
  const main = model.lines[0];
  const starts = model.starts.map((stops, k) => ({ key: `s${k}`, branch: true, terminal: 0, stops }));
  const ends = model.ends.map((stops, k) => ({ key: `e${k}`, branch: true, terminal: stops.length - 1, stops }));
  const mainStart = starts.findIndex(s => s.stops[0].stopId === main[0].stopId);
  if (mainStart >= 0) starts.push(...starts.splice(mainStart, 1));
  const mainEnd = ends.findIndex(s => s.stops[s.stops.length - 1].stopId === main[main.length - 1].stopId);
  if (mainEnd >= 0) ends.unshift(...ends.splice(mainEnd, 1));
  return [...starts, { key: 'trunk', branch: false, terminal: -1, stops: model.trunk }, ...ends];
}

/**
 * Where a marked stretch is drawn on the phone strip: the rows (one per distinct stop, in strip order) of exactly the
 * stops from `firstId` to `lastId` on the main line. A bracket only covers these rows, so it never spans another branch.
 */
export function phoneStretchRows(sections: readonly PhoneSection[], mainStops: readonly { stopId: string }[], from: number, to: number): { ids: Set<string>; first: number; last: number } {
  const ids = new Set(mainStops.slice(from, to + 1).map(s => s.stopId));
  const rowOf = new Map<string, number>();
  sections.forEach(sec => sec.stops.forEach(s => { if (!rowOf.has(s.stopId)) rowOf.set(s.stopId, rowOf.size); }));
  const rows = [...ids].map(id => rowOf.get(id)!);
  return { ids, first: Math.min(...rows), last: Math.max(...rows) };
}

/** Every stop of a model, trunk and forks, in drawing order. */
export function allBranchStops(m: BranchModel): RouteStripStop[] {
  const seen = new Set<string>();
  return [...m.starts.flat(), ...m.trunk, ...m.ends.flat()].filter(s => !seen.has(s.stopId) && seen.add(s.stopId));
}
