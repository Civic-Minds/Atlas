/**
 * CIV-1693: the Studio "buses needed" rows, by interlined route group. Built from the same
 * periodPatterns analysis the CLI prints (scripts/vehicles-needed.ts), so the numbers match it:
 * - A group the engine found (InterlineGroup) takes its scheduledVehicles and impliedVehicles as they are.
 * - A route in no group is a group of one: scheduled is the sum of its patterns' buses now, implied the
 *   sum of needVehicles over its regular patterns, rounded up once (the CLI's route totals).
 * Running time and layover are one trip on each full pattern of the group, summed: partial trips and short turns left
 * out (CIV-2031: TTC Line 1 read 247 min, the full route's 160 plus three short turns, like a round trip). At a target headway each regular pattern runs at the headway targetVehicles gives it (trunk
 * split by current share), and the group's cycle / headway is summed and rounded up once. Short turns are left out at a
 * target (CIV-2005): "if every route ran every N" is the whole route every N, which the full pattern already gives, and
 * keeping them at today's headway counted most of a frequent line's fleet at every 60 (TTC Line 1: 15 where ~5 run it).
 */
import type { PeriodPatterns, Pattern } from './vehiclePatterns.js';
import { cycleMin, needVehicles, targetVehicles } from './vehiclePatterns.js';
import { STUDIO_TARGETS, type StudioBranchSplit, type StudioVehicleGroup } from '../shared/studioVehicles.js';

const SCHEDULE = { kind: 'schedule' } as const;
const up = (v: number) => Math.ceil(v - 1e-9);

/**
 * One row per group, for the routes given (each with the analysis of its own representative day).
 * A group is listed once, from the first of its routes met; `nameOf` turns a route_id into its short name.
 */
export function vehicleGroupRows(
  routes: ReadonlyArray<{ routeId: string; analysis: PeriodPatterns }>,
  nameOf: (routeId: string) => string,
  /** A route_id's mode (effectiveMode), for the group's `modes` (CIV-2002). */
  modeOf?: (routeId: string) => number | undefined,
): StudioVehicleGroup[] {
  const rows: StudioVehicleGroup[] = [];
  const seen = new Set<string>();
  for (const { routeId, analysis: a } of routes) {
    if (!a.patterns.some(p => p.routeId === routeId)) continue;
    const group = a.interlines.find(g => g.routeIds.includes(routeId));
    const memberIds = group ? group.routeIds : [routeId];
    // A route already listed in an earlier group (read on another weekday) is not counted twice.
    if (seen.has(routeId)) continue;
    for (const id of memberIds) seen.add(id);
    const patterns = a.patterns.filter(p => memberIds.includes(p.routeId));
    const regular = patterns.filter(p => p.role !== 'partial');
    // CIV-2031: a short turn repeats part of a full pattern, so it isn't another branch to add to the running time.
    const cycle = regular.filter(p => p.role !== 'short turn');
    const layovers = cycle.map(p => p.layoverMin).filter((v): v is number => v != null);
    rows.push({
      routes: memberIds.map(nameOf).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })),
      ...(modeOf ? { modes: [...new Set(memberIds.map(modeOf).filter((m): m is number => m != null))].sort((x, y) => x - y) } : {}),
      scheduled: group ? group.scheduledVehicles : patterns.reduce((s, p) => s + p.scheduledVehicles, 0),
      implied: group ? group.impliedVehicles : up(regular.reduce((s, p) => s + needVehicles(p, SCHEDULE), 0)),
      runningMin: Math.round(cycle.reduce((s, p) => s + p.runningMin, 0)),
      layoverMin: layovers.length ? Math.round(layovers.reduce((s, v) => s + v, 0)) : null,
      atTarget: Object.fromEntries(STUDIO_TARGETS.map(hw => [hw, atTarget(memberIds, patterns, a, hw, 'current')])),
      // CIV-1712: the even split too, for the planner's choice, where the group has branches sharing a middle.
      ...(a.trunks.some(t => memberIds.includes(t.routeId))
        ? { atTargetEven: Object.fromEntries(STUDIO_TARGETS.map(hw => [hw, atTarget(memberIds, patterns, a, hw, 'even')])) }
        : {}),
    });
  }
  return rows;
}

function atTarget(memberIds: readonly string[], patterns: readonly Pattern[], a: PeriodPatterns, headwayMin: number, branchSplit: StudioBranchSplit): number {
  let buses = 0;
  for (const routeId of memberIds) {
    const own = patterns.filter(p => p.routeId === routeId);
    const targets = targetVehicles(own, a.trunks, { headwayMin, appliesTo: 'trunk', branchSplit, shortTurnHeadwayMin: null, recovery: SCHEDULE });
    for (const t of targets) {
      if (t.headwayMin == null || t.vehicles == null) continue;
      if (own.find(p => p.id === t.id)!.role === 'short turn') continue;
      buses += cycleMin(own.find(p => p.id === t.id)!, SCHEDULE) / t.headwayMin;
    }
  }
  return up(buses);
}
