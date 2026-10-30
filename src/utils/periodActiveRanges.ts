import type { ShapeProperties } from '../hooks/useIntervalStats';
import { headwayAboutMinutes } from './headwayText';

type HourFields = Pick<ShapeProperties, 'headwayByHour' | 'maxGapByHour' | 'departuresByHour'>;


function hourRuns(hourActive: (hour: number) => boolean, scanStart: number, endHour: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let hour = scanStart; hour <= endHour; hour++) {
    const active = hour < endHour && hourActive(hour);
    if (active && runStart === null) runStart = hour;
    if ((!active || hour === endHour) && runStart !== null) {
      ranges.push([runStart, hour]);
      runStart = null;
    }
  }
  return ranges;
}

/**
 * The hour runs, [start, end), in which any of the given directions has service, scanned from `scanStart` up to the
 * period's end. Where the hours with a headway name some run, the published departure counts (CIV-1010) name the
 * runs instead: every hour with a departure, the day's last one included (OC Transpo 162 evening: "6-11 PM", not
 * "6-10 PM"). Where no hour has a headway the answer stays empty, so the counts never add a notice or name hours
 * that the card did not name before; data built before the counts keeps the headway hours.
 */
export function activeHourRanges(
  directions: Partial<HourFields>[],
  scanStart: number,
  endHour: number,
): Array<[number, number]> {
  const byHeadway = hourRuns(hour => directions.some(direction => direction.headwayByHour?.[hour] != null), scanStart, endHour);
  if (byHeadway.length === 0 || !directions.some(direction => direction.departuresByHour)) return byHeadway;
  return hourRuns(hour => directions.some(direction => (direction.departuresByHour?.[hour] ?? 0) > 0), scanStart, endHour);
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
 * Whether a direction has service in the hour (#1137). `headwayByHour` needs three departures in a 60-90 minute
 * window, so an hourly route has none there; `maxGapByHour` is set for every hour with a departure except the day's
 * last one; the published departure counts (CIV-1010) cover that last hour. Any of the three counts, so the counts
 * only ever drop a part-period notice, never add one.
 */
export function hourHasService(direction: Partial<HourFields>, hour: number): boolean {
  return (direction.departuresByHour?.[hour] ?? 0) > 0 || direction.headwayByHour?.[hour] != null || direction.maxGapByHour?.[hour] != null;
}

/**
 * The hours inside the period with trips, for "This route runs only from …" (#1186): the same window the period's trips
 * are counted in. The headway hours name them where they can; a period with only a few trips has no headway hour, so its
 * departure hours name them instead of the whole period.
 */
export function periodTripRanges(directions: Partial<HourFields>[], startHour: number, endHour: number): Array<[number, number]> {
  const ranges = activeHourRanges(directions, startHour, endHour);
  return ranges.length > 0 ? ranges : hourRuns(hour => directions.some(direction => hourHasService(direction, hour)), startHour, endHour);
}

/** A part of the selected period outside the route's one run of service (N13): whether trips run there at all. */
export interface OutsidePart {
  at: 'start' | 'end';
  /** [start, end) hours of the part, inside the period. */
  hours: [number, number];
  /** 'none': no trips; 'less': trips, less often; 'unknown': the data can't tell the two apart. */
  service: 'none' | 'less' | 'unknown';
}

/**
 * The selected period split around the route's run of service, for the part-period notice (N13, Ryan: "every 12 min
 * from 7-9 AM, with no service from 6-7 AM"). Null when the route has more than one run in the period (the notice then
 * keeps its general wording) or none. A part has trips when any direction has service in one of its hours
 * (hourHasService). Without the departure counts (CIV-1010) a part at the end can't be told apart: the day's last
 * departure has no maxGapByHour, so a lone late trip would read as no service; that part is 'unknown'. A part at the
 * start always has later service after it, so its trips carry a maxGapByHour and the answer holds.
 */
export function partPeriodOutside(
  directions: Partial<HourFields>[],
  startHour: number,
  endHour: number,
): { active: [number, number]; parts: OutsidePart[] } | null {
  const runs = activeHourRanges(directions, Math.max(0, startHour - 1), endHour)
    .map(([a, b]) => [Math.max(a, startHour), Math.min(b, endHour)] as [number, number])
    .filter(([a, b]) => b > a);
  if (runs.length !== 1) return null;
  const [active] = runs;
  const counted = directions.some(direction => direction.departuresByHour);
  const service = (from: number, to: number, at: OutsidePart['at']): OutsidePart['service'] => {
    for (let hour = from; hour < to; hour++) if (directions.some(direction => hourHasService(direction, hour))) return 'less';
    return counted || at === 'start' ? 'none' : 'unknown';
  };
  const parts: OutsidePart[] = [];
  if (active[0] > startHour) parts.push({ at: 'start', hours: [startHour, active[0]], service: service(startHour, active[0], 'start') });
  if (active[1] < endHour) parts.push({ at: 'end', hours: [active[1], endHour], service: service(active[1], endHour, 'end') });
  return { active, parts };
}

/**
 * Whether a selected route outside the filter gets the part-period notice for this
 * period (#995). It needs trips inside the period (#1186) and a headway near it (that
 * scan starts an hour early) and, under a frequency filter, a service
 * window that stops short of the period: some hour of it with no departure. Without a
 * frequency filter, or when the route's filter value meets it, the earlier behaviour stands.
 */
export function partPeriodNoticeApplies(
  directions: Partial<HourFields>[],
  startHour: number,
  endHour: number,
  maxHeadway: number,
  /** The route's filter value for the period; the swap applies only when it misses the frequency filter. */
  filterValue: number | null | undefined,
): boolean {
  // #1186: trips inside the period, not only in the hour before it. The scan an hour early stays as well, so the
  // departure counts never add a notice.
  if (periodTripRanges(directions, startHour, endHour).length === 0) return false;
  if (activeHourRanges(directions, Math.max(0, startHour - 1), endHour).length === 0) return false;
  // No frequency filter, or the route meets it (hidden by span, limited, mode or agency filters
  // instead): the frequency notice would be false, so the earlier behaviour stands.
  if (maxHeadway === Infinity || (filterValue != null && filterValue <= maxHeadway)) return true;
  // A departure in every hour is service throughout (#1137), even when an hourly route has no
  // hourly headway. With the departure counts (CIV-1010) the hours the notice names come from the
  // same counts; on older data they still come from headways (the last hour has no maxGapByHour).
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
