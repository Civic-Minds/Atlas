import type { ShapeProperties } from '../hooks/useIntervalStats';

/**
 * The hour runs, [start, end), in which any of the given directions has a headway,
 * scanned from `scanStart` up to the period's end.
 */
export function activeHourRanges(
  directions: Pick<ShapeProperties, 'headwayByHour'>[],
  scanStart: number,
  endHour: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let hour = scanStart; hour <= endHour; hour++) {
    const active = hour < endHour && directions.some(direction => direction.headwayByHour?.[hour] != null);
    if (active && runStart === null) runStart = hour;
    if ((!active || hour === endHour) && runStart !== null) {
      ranges.push([runStart, hour]);
      runStart = null;
    }
  }
  return ranges;
}

/**
 * True when one active run spans every hour of the selected period (#995). The
 * part-period notice ("but not throughout the selected period") is only true when
 * this is false; a route that runs the whole period but misses the frequency
 * filter gets the outside-filter notice instead.
 */
export function activeRangesCoverPeriod(ranges: Array<[number, number]>, startHour: number, endHour: number): boolean {
  return ranges.some(([start, end]) => start <= startHour && end >= endHour);
}

/**
 * Whether a selected route outside the filter gets the part-period notice for this
 * period (#995). It needs some service near the period (the scan starts an hour
 * early, as the notice's range does) and, under a frequency filter, a service
 * window that stops short of the period. Without a frequency filter, or when the
 * route's filter value meets it, the earlier behaviour stands.
 */
export function partPeriodNoticeApplies(
  directions: Pick<ShapeProperties, 'headwayByHour'>[],
  startHour: number,
  endHour: number,
  maxHeadway: number,
  /** The route's filter value for the period; the swap applies only when it misses the frequency filter. */
  filterValue: number | null | undefined,
): boolean {
  if (activeHourRanges(directions, Math.max(0, startHour - 1), endHour).length === 0) return false;
  // No frequency filter, or the route meets it (hidden by span, limited, mode or agency filters
  // instead): the frequency notice would be false, so the earlier behaviour stands.
  if (maxHeadway === Infinity || (filterValue != null && filterValue <= maxHeadway)) return true;
  return !activeRangesCoverPeriod(activeHourRanges(directions, startHour, endHour), startHour, endHour);
}
