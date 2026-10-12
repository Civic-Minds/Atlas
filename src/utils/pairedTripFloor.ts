import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';

/**
 * Paired trips (two buses minutes apart, then a long wait) give an unsustained period a median
 * of a few minutes while the period's typical-gap range shows the real cadence: Niagara 105
 * Saturday has a midday median of 2 and a range of 30-60 (#761). That median is not a cadence
 * riders get. Use the period's full-window coverage instead, the value the map filter already
 * uses for an unsustained period (shared/tileFilterExprs.ts). Own direction first, as card rows
 * are per branch; then the period's longest gap, the route's worst direction, and the range
 * itself. Null when the period does not show this pattern.
 *
 * Fires when median * 3 <= range.min. Periods without a published range are left alone: there a
 * short median can't be told from real short-span service (TTC 22 Sunday AM, GRT 301 AM).
 *
 * Known false positive: a feature that interleaves three or more patterns under one headsign can
 * have a genuinely short median (the combined service) while its range reflects one pattern's
 * spacing. If that period is also unsustained, this floor hides the combined cadence. None of the
 * rows in the #761 sweep looked like that, but treat a floored value on such a route with care.
 */
export function pairedTripPeriodFloor(p: ShapeProperties, period: TimePeriod): number | null {
  if (period === 'all' || p.headwayByPeriodSustained?.[period] !== false) return null;
  const median = p.headwayByPeriod?.[period];
  const range = p.headwayRangeByPeriod?.[period];
  if (median == null || !range || median * 3 > range.min) return null;
  return p.periodCoverageHeadway?.[period]
    ?? p.maxGapByPeriod?.[period]
    ?? p.worstDirectionPeriodCoverageHeadway?.[period]
    ?? range.min;
}

/** A period or hourly value, raised to the paired-trip floor when the period has one (#761). */
export function pairedTripSafeHeadway(p: ShapeProperties, period: TimePeriod | null | undefined, value: number | null): number | null {
  if (value == null || !period) return value;
  const floor = pairedTripPeriodFloor(p, period);
  return floor != null && floor > value ? floor : value;
}
