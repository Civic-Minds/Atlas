import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { periodKeyForHour } from '../../shared/config';
import { buildRouteServiceSummary, metricValueForPeriod } from './routeFacts';

/** Headsign-scoped trunk minimum for route-card range display (not route-wide combined deps). */
export function headsignTrunkHeadway(d: ShapeProperties, period: string): number | null {
  const shared = buildRouteServiceSummary(d).shared;
  if (period === 'all') return shared.value;
  return shared.byHeadsignPeriod?.[period] ?? null;
}

/** Show `every X–Y min` only when trunk wait is materially better than destination wait. */
export function shouldShowBranchHeadwayRange(
  trunkHw: number | null | undefined,
  destHw: number | null | undefined,
  multiBranch: boolean,
): boolean {
  if (!multiBranch || trunkHw == null || destHw == null) return false;
  if (trunkHw < 5 || trunkHw >= destHw) return false;
  if (destHw - trunkHw < 5) return false;
  if (destHw / trunkHw > 4) return false;
  return true;
}

export function dirIdNum(dirId: number | string | undefined | null): number {
  const n = Number(dirId);
  return Number.isFinite(n) ? n : 0;
}

function hourlyNonNullCount(d: ShapeProperties): number {
  const hh = buildRouteServiceSummary(d).branch.byHour;
  if (!hh) return 0;
  return Object.values(hh).filter((v): v is number => v != null).length;
}

/**
 * Directions to feed the route-card sparkline.
 * Prefer dir 0 when it has hourly data; otherwise any direction with hourly
 * data (Anchorage 31/40/41/51 only encode dir 1). Never hard-require dir 0.
 */
export function sparklineSourceDirections(
  directions: ShapeProperties[],
  primaryMultiBranch?: ShapeProperties[] | null,
): ShapeProperties[] {
  if (primaryMultiBranch && primaryMultiBranch.some(d => hourlyNonNullCount(d) > 0)) {
    return primaryMultiBranch;
  }
  const withHours = directions.filter(d => hourlyNonNullCount(d) > 0);
  if (withHours.length === 0) return directions;
  const dir0 = withHours.filter(d => dirIdNum(d.directionId) === 0);
  if (dir0.length > 0) return dir0;
  // Pick the direction with the richest hourly series
  const bestDir = withHours.reduce((best, d) => {
    const id = dirIdNum(d.directionId);
    return hourlyNonNullCount(d) > hourlyNonNullCount(best) ? d : best;
  });
  const id = dirIdNum(bestDir.directionId);
  return withHours.filter(d => dirIdNum(d.directionId) === id);
}

/** Combined trunk headway from scheduled branch cadences on a shared section. */
function isLimitedBranch(d: ShapeProperties): boolean {
  return d.tier === 'infrequent'
    || d.tier === 'span'
    || /drop[- ]?offs?\s+only/i.test(d.headsign ?? '');
}

export function groupTrunkHeadway(branches: ShapeProperties[], period: string): number | null {
  const values = branches
    .filter(d => !isLimitedBranch(d))
    .map(d => metricValueForPeriod(buildRouteServiceSummary(d).branch, period as TimePeriod))
    .filter((v): v is number => v != null && v > 0);
  if (values.length === 0) return null;
  const combined = 1 / values.reduce((sum, value) => sum + 1 / value, 0);
  return Math.max(1, Math.round(combined));
}

/** Shared on-shape stops in the order used by the first branch. */
export function sharedStopIdsForBranches(branches: ShapeProperties[]): string[] {
  const withStops = branches.filter(d => !isLimitedBranch(d) && (d.stopOrder?.length ?? 0) >= 2);
  if (withStops.length < 2) return [];

  const stopBranches = new Map<string, Set<number>>();
  withStops.forEach((branch, branchIndex) => {
    for (const stopId of new Set(branch.stopOrder)) {
      const branchSet = stopBranches.get(stopId) ?? new Set<number>();
      branchSet.add(branchIndex);
      stopBranches.set(stopId, branchSet);
    }
  });

  return withStops[0].stopOrder!.filter((stopId, index, order) =>
    order.indexOf(stopId) === index && (stopBranches.get(stopId)?.size ?? 0) >= 2,
  );
}

function medianHeadway(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function medianTerminalHeadway(branches: ShapeProperties[], period: TimePeriod): number | null {
  const vals = branches
    .map(d => {
      if (period !== 'all') {
        return metricValueForPeriod(buildRouteServiceSummary(d).branch, period as TimePeriod);
      }
      return buildRouteServiceSummary(d).branch.value;
    })
    .filter((v): v is number => v != null);
  return vals.length ? medianHeadway(vals) : null;
}

/** Minimum real stops branches must share before a "Combined" figure is shown -- one shared
 *  stop can be a coincidental terminal (see MIN_SHARED_STOPS in scripts/detect-route-branches.ts). */
const MIN_SHARED_STOPS_FOR_TRUNK = 2;

/**
 * True when two branches visit their shared stops in the same relative order -- a real shared
 * trunk. False when the order runs opposite: the same physical path traveled in reverse (e.g. a
 * loop route's two directions), which is not a combinable trunk even though the branches can
 * share every stop (#441: Durango's Trolley North/South share all 29 stops, just in reverse).
 * Not enough ordered pairs to judge -> true (don't block on ambiguous data).
 */
function sharesOrderedTrunk(branchA: ShapeProperties, branchB: ShapeProperties, sharedStopIds: string[]): boolean {
  const indexA = new Map(branchA.stopOrder!.map((id, i) => [id, i]));
  const indexB = new Map(branchB.stopOrder!.map((id, i) => [id, i]));
  const pairs = sharedStopIds
    .map((id): [number, number] | null => {
      const a = indexA.get(id);
      const b = indexB.get(id);
      return a != null && b != null ? [a, b] : null;
    })
    .filter((pair): pair is [number, number] => pair != null)
    .sort((a, b) => a[0] - b[0]);
  if (pairs.length < 2) return true;
  let increasing = 0;
  let decreasing = 0;
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i][1] > pairs[i - 1][1]) increasing++;
    else if (pairs[i][1] < pairs[i - 1][1]) decreasing++;
  }
  return increasing >= decreasing;
}

/** True when combined trunk is materially better than typical destination wait. */
export function shouldShowTrunkSummary(branches: ShapeProperties[], period: TimePeriod): boolean {
  const sustainedBranches = branches.filter(d => !isLimitedBranch(d));
  if (sustainedBranches.length < 2) return false;
  // Two headsigns sharing a direction_id aren't necessarily branches of one corridor -- an
  // agency can mislabel opposite directions with the same direction_id (#441). Only judge this
  // when real on-shape stop data exists for at least two branches; otherwise fall through to the
  // ratio check below unchanged (missing data must not silently hide a legitimate Combined row).
  const withRealStops = sustainedBranches.filter(d => (d.stopOrder?.length ?? 0) >= 2);
  if (withRealStops.length >= 2) {
    const shared = sharedStopIdsForBranches(withRealStops);
    if (shared.length < MIN_SHARED_STOPS_FOR_TRUNK) return false;
    if (!sharesOrderedTrunk(withRealStops[0], withRealStops[1], shared)) return false;
  }
  const periodKey = period !== 'all' ? period : 'midday';
  const trunk = groupTrunkHeadway(sustainedBranches, periodKey);
  const terminal = medianTerminalHeadway(sustainedBranches, period);
  if (trunk == null || terminal == null) return false;
  return trunk <= terminal * 0.65 && terminal / trunk <= 4;
}

/** Trunk hourly curve from combined stop headways (flat within each period). */
export function trunkSparklineByHour(
  branches: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const h of hours) {
    const pk = periodKeyForHour(h);
    out[h] = pk ? groupTrunkHeadway(branches, pk) : null;
  }
  return out;
}
