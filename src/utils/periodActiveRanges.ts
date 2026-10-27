import type { ShapeProperties } from '../hooks/useIntervalStats';
import { headwayAboutMinutes } from './headwayText';

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
 * Whether a direction has any departure in the hour (#1137). `headwayByHour` needs three
 * departures in a 60-90 minute window, so an hourly route has none there; `maxGapByHour`
 * is set for every hour with a departure, except the hour of the day's last one.
 */
export function hourHasService(direction: Pick<ShapeProperties, 'headwayByHour' | 'maxGapByHour'>, hour: number): boolean {
  return direction.headwayByHour?.[hour] != null || direction.maxGapByHour?.[hour] != null;
}

/**
 * Whether a selected route outside the filter gets the part-period notice for this
 * period (#995). It needs some service near the period (the scan starts an hour
 * early, as the notice's range does) and, under a frequency filter, a service
 * window that stops short of the period: some hour of it with no departure. Without a
 * frequency filter, or when the route's filter value meets it, the earlier behaviour stands.
 */
export function partPeriodNoticeApplies(
  directions: Pick<ShapeProperties, 'headwayByHour' | 'maxGapByHour'>[],
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
  // A departure in every hour is service throughout (#1137), even when an hourly route has no
  // hourly headway. This only drops the sentence; the hours it names still come from headways,
  // because the hour of a direction's last departure has no maxGapByHour.
  for (let hour = startHour; hour < endHour; hour++) {
    if (!directions.some(direction => hourHasService(direction, hour))) return true;
  }
  return false;
}

/**
 * The frequency the part-period notice names, or null to name none (#1123). The route's filter
 * value is measured across the whole period, including the wait before the first or after the
 * last trip, so it can read slower than every row on the card (RFTA HC AM Peak: "every 60 min"
 * above rows of every 20). When the number the notice would print is slower than every row's,
 * the notice names no frequency; when a row runs that slowly or slower, the number stays. With no row
 * showing a number there is nothing to confirm it against, and on a peak-only route it is the wait
 * between its rush-hour trips (TTC 10 weekday Midday: "every 330 min" over rows of "no regular
 * service", #1043), so the notice names none.
 */
export function partPeriodNoticeHeadway(
  filterValue: number | null | undefined,
  rowHeadways: ReadonlyArray<number | null | undefined>,
): number | null {
  if (filterValue == null) return null;
  const rows = rowHeadways.filter((h): h is number => typeof h === 'number' && Number.isFinite(h) && h > 0);
  const shown = headwayAboutMinutes(filterValue);
  if (rows.length === 0) return null;
  return rows.every(h => shown > headwayAboutMinutes(h)) ? null : filterValue;
}
