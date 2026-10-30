import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { periodKeyForHour } from '../../shared/config';
import { branchDisplayPeriodHeadway, buildRouteServiceSummary } from './routeFacts';
import { MIN_SHARED_STOPS_FOR_TRUNK, sharedStopIds, sharesOrderedTrunk } from './routeBranchGeometry';
import { failingRouteSharedRanges, sharedStretchStopPass } from './frequencySegments';
import { rowTrips } from './rowTrips';
import { stretchRowsFromMeta } from './stretchCard';
import { hourHasService } from './periodActiveRanges';

/** Headsign-scoped trunk minimum for route-card range display (not route-wide combined deps). */
export function headsignTrunkHeadway(d: ShapeProperties, period: string): number | null {
  const shared = buildRouteServiceSummary(d).shared;
  if (period === 'all') return shared.value;
  return shared.byHeadsignPeriod?.[period] ?? null;
}

/**
 * Show `every X-Y min` whenever the headsign-scoped trunk wait is materially better than the
 * destination wait -- including a single branch whose own headsign has a faster same-destination
 * short-turn overlapping it (e.g. TTC 94 eastbound "Castle Frank" served by both a full-length and
 * a Wellesley-originating pattern, #493). Previously required 2+ realTier branches, which hid this
 * exact case: the pipeline already pools short-turn departures into headsignMinStopHeadwayByPeriod
 * regardless of branch count (process-core.ts), so the trunk value itself is already trustworthy
 * for a single branch -- the ratio/gap checks below are what actually guards against noise.
 */
export function shouldShowBranchHeadwayRange(
  trunkHw: number | null | undefined,
  destHw: number | null | undefined,
): boolean {
  if (trunkHw == null || destHw == null) return false;
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
  const bestDir = withHours.reduce((best, d) => (hourlyNonNullCount(d) > hourlyNonNullCount(best) ? d : best));
  const id = dirIdNum(bestDir.directionId);
  return withHours.filter(d => dirIdNum(d.directionId) === id);
}

/**
 * "All directions" hourly series: the worst direction each hour (longest
 * headway, fewest trips). Matches the filter rule that every direction must
 * pass. Hours where only one direction runs use that direction.
 */
export function worstDirectionByHour(
  series: Array<Partial<Record<number, number | null>>>,
  hours: readonly number[],
): Record<number, number | null> {
  const out: Record<number, number | null> = {};
  for (const h of hours) {
    const values = series
      .map(s => s[h])
      .filter((v): v is number => v != null && v > 0);
    out[h] = values.length > 0 ? Math.max(...values) : null;
  }
  return out;
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
    .map(d => branchDisplayPeriodHeadway(d, period as TimePeriod))
    .filter((v): v is number => v != null && v > 0);
  if (values.length === 0) return null;
  const combined = 1 / values.reduce((sum, value) => sum + 1 / value, 0);
  return Math.max(1, Math.round(combined));
}

/** Shared on-shape stops in the order used by the first branch, restricted to real, non-limited
 *  branches. Thin wrapper over routeBranchGeometry.ts's generic sharedStopIds. */
export function sharedStopIdsForBranches(branches: ShapeProperties[]): string[] {
  return sharedStopIds(branches.filter(d => !isLimitedBranch(d)));
}

/** The middle value, rounded to a whole minute when it falls between two. */
export function medianHeadway(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function medianTerminalHeadway(branches: ShapeProperties[], period: TimePeriod): number | null {
  const vals = branches
    .map(d => {
      if (period !== 'all') {
        return branchDisplayPeriodHeadway(d, period as TimePeriod);
      }
      return buildRouteServiceSummary(d).branch.value;
    })
    .filter((v): v is number => v != null);
  return vals.length ? medianHeadway(vals) : null;
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
    const hasExplicitBranches = withRealStops.some(d => d.routeVariant?.trim());
    if (shared.length < (hasExplicitBranches ? 2 : MIN_SHARED_STOPS_FOR_TRUNK)) return false;
    if (!sharesOrderedTrunk(withRealStops[0], withRealStops[1], shared)) return false;
  }
  const periodKey = period !== 'all' ? period : 'midday';
  const trunk = groupTrunkHeadway(sustainedBranches, periodKey);
  const terminal = medianTerminalHeadway(sustainedBranches, period);
  if (trunk == null || terminal == null) return false;
  return trunkBeatsBranches(trunk, terminal);
}

/** The shared section is materially better than the typical branch: worth its own row. */
function trunkBeatsBranches(trunk: number, terminal: number): boolean {
  return trunk <= terminal * 0.65 && terminal / trunk <= 4;
}

/**
 * CIV-937: the "Shared stretch every N" row of a direction whose rows come from the stretches: the main stretch's own
 * value (stretchMeta.main) above its branch rows, each branch keeping its own wait. Only when the direction shows two
 * or more rows with a tail among them (the main stretch's own row is the branch that runs on past it), and the shared
 * value is materially better than the rows' (the Combined rule).
 * Null on data without the value, for All day, and for a period the main stretch has no regular service in.
 */
export function stretchSharedHeadway(
  group: { realTier: ShapeProperties[]; directionFeatures?: ShapeProperties[] },
  period: TimePeriod,
): number | null {
  if (period === 'all' || !group.directionFeatures) return null;
  const rows = group.realTier;
  if (rows.length < 2 || !rows.some(d => d.stretchRole === 'tail')) return null;
  // Every feature of the direction carries the same stretchMeta; a direction of tails alone (MARTA 20) has no main feature.
  const meta = group.directionFeatures.find(d => d.stretchRole === 'main') ?? group.directionFeatures.find(d => d.stretchMeta?.main);
  const shared = meta ? stretchRowsFromMeta(meta, period).find(r => r.role === 'main') : undefined;
  if (shared?.value == null || shared.noRegular) return null;
  const rowValues = rows.map(d => rowTrips(d, period).value);
  if (rowValues.some(v => v == null)) return null;
  return trunkBeatsBranches(shared.value, medianHeadway(rowValues as number[])) ? shared.value : null;
}

/**
 * Trunk hourly curve from combined stop headways (flat within each period). An hour no branch runs in stays empty
 * (CIV-1106): the period's value covers only the hours with service, so TTC 504 westbound shows no bar at 3 AM, when
 * no streetcar runs, beside the Overnight value at 2 AM. Data without hourly fields keeps the flat curve.
 */
export function trunkSparklineByHour(
  branches: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  const hourly = branches.some(b => b.headwayByHour || b.departuresByHour || b.maxGapByHour);
  const out: Record<number, number | null> = {};
  for (const h of hours) {
    const pk = periodKeyForHour(h);
    const trunk = pk && (!hourly || branches.some(b => hourHasService(b, h))) ? groupTrunkHeadway(branches, pk) : null;
    out[h] = trunk == null ? null : thinHourHeadway(branches, h, trunk) ?? trunk;
  }
  return out;
}

/**
 * The hour's own wait from the branches' departures, when the hour is thin and the period's value would overstate it
 * (CIV-1106): TTC 504 eastbound at 3 AM has one or two streetcars, not "every 10". Thin means every branch has no
 * hourly headway or at most three departures in the hour; the hour's own wait counts only when it is at least twice
 * the period's, so a busy hour, or one a few minutes off its period, keeps the period's value. Null otherwise, and on
 * data without the departure counts (CIV-1010).
 */
function thinHourHeadway(branches: ShapeProperties[], hour: number, trunk: number): number | null {
  const counted = branches.filter(b => !isLimitedBranch(b));
  if (counted.length === 0 || !counted.every(b => b.departuresByHour)) return null;
  if (!counted.every(b => b.headwayByHour?.[hour] == null || (b.departuresByHour?.[hour] ?? Infinity) <= 3)) return null;
  const departures = counted.reduce((sum, b) => sum + (b.departuresByHour?.[hour] ?? 0), 0);
  if (departures === 0) return null;
  const own = 60 / departures;
  return own >= 2 * trunk ? Math.round(own) : null;
}

/**
 * Shared-stretch cadence for a direction's branches (CIV-82), from the SAME per-stop pass the map
 * overlay draws with (sharedStretchStopPass): this direction's worst filter value over the
 * stops that qualify (both directions passing) under the active filter (every stop with a value on both sides when no
 * filter is set). So the card never shows a stretch the map does not draw, or a better N than its
 * worst drawn stop. Null when no stop qualifies (the card then keeps its Combined estimate).
 * `agencyFeatures` is the agency's whole feature list (stops, the pooled carrier, the opposite
 * direction).
 */
export function sharedStretchHeadway(
  agencyFeatures: readonly GeoJSON.Feature[] | undefined,
  branches: ShapeProperties[],
  period: TimePeriod,
  maxHeadway: number,
): { headway: number; stopIds: string[] } | null {
  if (!agencyFeatures || branches.length === 0) return null;
  // The card holds shallow copies of the agency features' properties; their stopOrder arrays
  // are the originals, so they identify the features.
  const wanted = new Set<unknown>(branches.map(b => b.stopOrder).filter(Boolean));
  const routeFeatures = agencyFeatures.filter(f => wanted.has((f.properties as any)?.stopOrder));
  if (routeFeatures.length === 0) return null;
  let worst: number | null = null;
  const stopIds = new Set<string>();
  for (const { feature, ranges, ownValues } of sharedStretchStopPass(routeFeatures, agencyFeatures, period, maxHeadway, { includePassing: true })) {
    // A direction run as one pattern has no branches to combine: no "Shared stretch" row there.
    if (!(feature.properties as any)?.sharedStretches?.length) continue;
    const stopOrder = (feature.properties as unknown as ShapeProperties).stopOrder ?? [];
    for (const [from, to] of ranges) {
      for (let i = from; i <= to; i++) {
        // This direction's own value: the card row sits under the direction's heading.
        const v = ownValues.get(i);
        if (v == null) continue;
        worst = worst == null ? v : Math.max(worst, v);
        stopIds.add(stopOrder[i]);
      }
    }
  }
  return worst == null ? null : { headway: worst, stopIds: [...stopIds] };
}

/**
 * CIV-514: whether part of a route that misses the filter still qualifies, by the same per-stop pass that draws the
 * map's shared-stretch overlay for failing routes (failingRouteSharedRanges), so the card's note and the map agree.
 * `directions` are the card's copies of the route's features; their stopOrder arrays identify the features.
 */
export function routePartMeetsFilter(
  agencyFeatures: readonly GeoJSON.Feature[] | undefined,
  directions: ShapeProperties[],
  period: TimePeriod,
  maxHeadway: number,
): boolean {
  if (!agencyFeatures || directions.length === 0) return false;
  const wanted = new Set<unknown>(directions.map(d => d.stopOrder).filter(Boolean));
  const routeFeatures = agencyFeatures.filter(f => wanted.has((f.properties as any)?.stopOrder));
  return failingRouteSharedRanges(routeFeatures, agencyFeatures, period, maxHeadway).some(r => r.ranges.length > 0);
}
