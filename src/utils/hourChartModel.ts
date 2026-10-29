import type { AxisTick } from '../components/Interval/TripTimeStrip';
import type { HeadwayByPeriod } from '../hooks/useAgencyData';
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { isHourInPeriod, periodKeyForHour } from '../../shared/config';
import { branchStackColor } from './colors';
import { branchDisplayHourHeadway, branchDisplayPeriodHeadway, buildRouteServiceSummary } from './routeFacts';
import { medianHeadway, shouldShowTrunkSummary, sparklineSourceDirections, trunkSparklineByHour, worstDirectionByHour } from './routeCardTrunk';
import { headwayAmount } from './headwayText';
import { isRiderMeaningfulGap } from './routeCardUneven';
import { HOUR_TO_PERIOD } from './sparklinePeriods';

/**
 * The hour chart's model (CIV-1011 #10): each direction's hour values, its scale, each bar's height, colour and
 * emphasis, and which period band is lit. The route card's chart and every chart of its full-day view read these, so
 * the same hour draws the same way everywhere, and no chart fills its hours by a rule of its own (CIV-1118).
 */

type HourSeries = Partial<Record<number, number | null | undefined>>;

/** The scale's top in trips per minute: the busiest hour of any series given, never below `floor`. */
export function hourChartMaxFreq(series: readonly HourSeries[], hours: readonly number[], floor = 0): number {
  let max = floor;
  for (const byHour of series) {
    for (const h of hours) {
      const v = byHour[h];
      if (v != null && v > 0 && 1 / v > max) max = 1 / v;
    }
  }
  return max;
}

/**
 * Bar height for one hour. Height is proportional to trips per hour (1 / headway) measured from zero,
 * so a 35-minute hour is ~2/3 the height of a 23-minute hour instead of collapsing to a stub. A small
 * floor keeps any hour with service visible.
 */
export function sparklineBarHeight(headway: number | null | undefined, maxFreq: number, chartHeight: number): number {
  if (headway == null || !(headway > 0) || !(maxFreq > 0)) return 0;
  const floor = Math.min(3, chartHeight);
  return Math.max(floor, Math.round((1 / headway) / maxFreq * chartHeight));
}

/**
 * Headway axis for the full-day charts: round headways ("10 min") placed where a bar of that headway
 * tops out. Bars are as tall as 1/headway on the chart's fixed scale (sparklineBarHeight), so a tick's
 * height is (1/minutes) / maxFreq, and more frequent service sits higher.
 */
export function headwayAxisTicks(maxFreq: number, height: number): AxisTick[] {
  if (!(maxFreq > 0)) return [];
  const minGap = height < 60 ? 16 : 24;
  const maxTicks = height < 60 ? 2 : 3;
  const ticks: AxisTick[] = [];
  let lastPx = Infinity;
  for (const minutes of [2, 3, 5, 10, 15, 20, 30, 60, 120]) {
    const fraction = (1 / minutes) / maxFreq;
    const px = fraction * height;
    if (fraction > 1.0001 || px < 14 || lastPx - px < minGap || ticks.length >= maxTicks) continue;
    ticks.push({ label: headwayAmount(minutes), fraction: Math.min(1, fraction) });
    lastPx = px;
  }
  return ticks;
}

/** The headway a bar's tier colour reads: the hour's longest gap when it is a real gap for riders, else its headway (CIV-497). */
export function hourBarColorHeadway(headway: number, maxGap: number | null | undefined): number {
  return maxGap != null && isRiderMeaningfulGap(maxGap, headway) ? maxGap : headway;
}

/** How strongly a bar draws: full in the selected period (or with none selected), then the lit band, else faded. */
export function hourBarEmphasis(hour: number, activePeriod: string | null, litPeriod: string | null): 'active' | 'lit' | 'dim' {
  if (!activePeriod || isHourInPeriod(hour, activePeriod)) return 'active';
  return litPeriod && HOUR_TO_PERIOD[hour] === litPeriod ? 'lit' : 'dim';
}

/**
 * The period whose band is lit: the hovered one, else the selected period when it has bars. A period with
 * no bars gets no band: over empty columns it reads as a placeholder (a night route at midday). CIV-933.
 */
export function hourChartLitPeriod(hoverPeriod: string | null, activePeriod: string | null, byHour: HourSeries, hours: readonly number[]): string | null {
  if (hoverPeriod) return hoverPeriod;
  return activePeriod && hours.some(h => isHourInPeriod(h, activePeriod) && byHour[h] != null) ? activePeriod : null;
}

/** Merge hourly headways across branches: the median per hour avoids min-spike artifacts (#98). */
function mergeHeadwayByHour(directions: ShapeProperties[], hours: readonly number[]): Record<number, number | null> {
  const merged: Record<number, number | null> = {};
  for (const h of hours) {
    const values = directions
      .map(d => buildRouteServiceSummary(d).branch.byHour?.[h])
      .filter((v): v is number => v != null);
    merged[h] = values.length === 0 ? null : values.length === 1 ? values[0] : medianHeadway(values);
  }
  return merged;
}

/** Cap hourly values below period summary when paired departures bunch (#91). */
export function sparklineHeadwayByHour(
  directions: ShapeProperties[],
  hours: readonly number[],
): Record<number, number | null> {
  const raw = mergeHeadwayByHour(directions, hours);
  const out: Record<number, number | null> = {};
  for (const h of hours) {
    const hw = raw[h];
    if (hw == null) { out[h] = null; continue; }
    const pk = periodKeyForHour(h);
    if (!pk) { out[h] = hw; continue; }
    const periodVals = directions
      .map(d => branchDisplayPeriodHeadway(d, pk as keyof HeadwayByPeriod))
      .filter((v): v is number => v != null);
    if (periodVals.length === 0) { out[h] = hw; continue; }
    const periodRep = periodVals.length === 1 ? periodVals[0] : medianHeadway(periodVals);
    out[h] = hw < periodRep * 0.75 ? periodRep : hw;
  }
  return out;
}

/** The longest gap of any of the directions in each hour. */
function maxGapByHour(directions: ShapeProperties[], hours: readonly number[]): Record<number, number | null> {
  return Object.fromEntries(hours.map(h => {
    const values = directions
      .map(d => d.maxGapByHour?.[h])
      .filter((v): v is number => v != null);
    return [h, values.length > 0 ? Math.max(...values) : null];
  }));
}

/** The direction groups the hour chart reads: the card's rows (realTier) and its limited patterns (span). */
export interface HourChartGroup {
  realTier: ShapeProperties[];
  span: ShapeProperties[];
}

/**
 * One direction's hourly series, as every hour chart shows it. A direction whose branches share a trunk uses the
 * combined trunk curve; otherwise its branches are merged.
 */
export function directionHourSeries(group: HourChartGroup, period: TimePeriod, hours: readonly number[]): Record<number, number | null> {
  return group.realTier.length >= 2 && shouldShowTrunkSummary(group.realTier, period)
    ? trunkSparklineByHour(group.realTier, hours)
    : sparklineHeadwayByHour(group.realTier, hours);
}

export interface HourStackSegment {
  label: string;
  headway: number;
  color: string;
  faded?: boolean;
}

/** One hour of a branch stack: each branch's own trips that hour, in its branch colour, faded when not selected. */
export function branchHourStack(
  branches: ShapeProperties[],
  hour: number,
  isSelected?: (branch: ShapeProperties) => boolean,
): HourStackSegment[] {
  return branches
    .map((branch, i) => ({
      label: branch.headsign ?? `Branch ${i + 1}`,
      headway: branchDisplayHourHeadway(branch, hour),
      color: branchStackColor(i),
      ...(isSelected ? { faded: !isSelected(branch) } : {}),
    }))
    .filter((segment): segment is HourStackSegment & { headway: number } => segment.headway != null);
}

/** A stack's combined wait in whole minutes, like the Combined row (groupTrunkHeadway), so it reads "every 15 min". */
export function stackHeadway(segments: readonly { headway: number }[]): number | null {
  const perMinute = segments.reduce((sum, segment) => sum + 1 / segment.headway, 0);
  return perMinute > 0 ? Math.max(1, Math.round(1 / perMinute)) : null;
}

/** A group's branches as its stack draws them: the rows, then the limited patterns. */
export function stackBranches(group: HourChartGroup): ShapeProperties[] {
  return [...group.realTier, ...group.span];
}

/**
 * The route card's hour model: one series per direction, the inline chart's series (the slower direction each hour,
 * never one direction silently), its gap colours, the primary multi-branch direction's branch stack, and one y-axis
 * top for everything the card or its full-day view can draw.
 */
export function routeHourModel<G extends HourChartGroup>({ groups, directions, primaryMultiBranch, period, hours }: {
  /** The direction groups the card shows. */
  groups: G[];
  /** The route's directions, for the fallback series when no group has hours. */
  directions: ShapeProperties[];
  /** The largest multi-branch direction group, if any. */
  primaryMultiBranch: HourChartGroup | undefined;
  period: TimePeriod;
  hours: readonly number[];
}) {
  const defaultSparklineDirs = sparklineSourceDirections(directions, primaryMultiBranch?.realTier);
  const perDirection = groups.map(group => ({ group, byHour: directionHourSeries(group, period, hours) }));
  const directionsWithHours = perDirection.filter(entry => hours.some(h => entry.byHour[h] != null));
  const defaultMerged = directionsWithHours.length > 0
    ? worstDirectionByHour(directionsWithHours.map(entry => entry.byHour), hours)
    : sparklineHeadwayByHour(defaultSparklineDirs, hours);
  const hasTrunkSparkline = !!primaryMultiBranch && shouldShowTrunkSummary(primaryMultiBranch.realTier, period);
  const mergedMaxGaps = maxGapByHour(
    directionsWithHours.length > 0 ? directionsWithHours.flatMap(entry => entry.group.realTier) : defaultSparklineDirs,
    hours,
  );
  // Branch stacks describe the primary multi-branch direction: every hour that direction
  // runs is stacked, so whether an hour shows branch colours never depends on two series
  // landing on the same number (CIV-497).
  const primaryTrunkByHour = hasTrunkSparkline ? trunkSparklineByHour(primaryMultiBranch!.realTier, hours) : null;
  const defaultStackedByHour = hasTrunkSparkline
    ? Object.fromEntries(hours.map(h => [h, primaryTrunkByHour![h] != null && defaultMerged[h] != null
      ? branchHourStack(primaryMultiBranch!.realTier, h)
      : []])) as Record<number, HourStackSegment[]>
    : undefined;
  // One y-axis top for the route: the busiest hour of anything the card or the full-day view can
  // draw (the default chart, each direction, each direction's branches together).
  const scaleMaxFreq = hourChartMaxFreq([
    defaultMerged,
    ...perDirection.map(entry => entry.byHour),
    // Only directions that can draw a branch stack (two or more branches): a one-branch direction's raw
    // hourly reading is never drawn, so it must not set the top (Milton 4: a 6 a.m. reading of 18 vs 30 shown).
    ...groups.filter(group => stackBranches(group).length >= 2)
      .map(group => Object.fromEntries(hours.map(h => [h, stackHeadway(branchHourStack(stackBranches(group), h))]))),
  ], hours);
  return { defaultSparklineDirs, perDirection, directionsWithHours, defaultMerged, hasTrunkSparkline, mergedMaxGaps, defaultStackedByHour, scaleMaxFreq };
}
