/**
 * Trip time by hour for the route card's full-day view (beta). Reads the `runningTimes` block
 * the pipeline already publishes in each agency's JSON (CIV-84); nothing extra is fetched.
 */
import { SPARKLINE_HOURS } from '../../shared/config';

export type TripMinutesByHour = Record<number, number>;

export interface TripTimeSeries {
  byHour: TripMinutesByHour;
  /** The route starts and ends at the same place, so each value is one full loop. */
  loop?: boolean;
}

/** One `runningTimes` entry as published: `h` = median minutes by hour. */
interface PublishedRunningTime {
  h?: Record<string, number>;
  loop?: true;
}

export type PublishedRunningTimes = Record<string, PublishedRunningTime> | undefined;

/** The first of `routeIds` that has an entry for this direction and day. */
export function tripTimeSeriesFor(
  runningTimes: PublishedRunningTimes,
  routeIds: readonly string[],
  directionId: number,
  day: string,
): TripTimeSeries | null {
  if (!runningTimes) return null;
  for (const routeId of routeIds) {
    const entry = runningTimes[`${routeId}::${directionId}::${day}`];
    if (!entry?.h) continue;
    const byHour: TripMinutesByHour = {};
    for (const hour of SPARKLINE_HOURS) {
      const minutes = entry.h[String(hour)];
      if (typeof minutes === 'number' && minutes > 0) byHour[hour] = minutes;
    }
    if (Object.keys(byHour).length > 0) return { byHour, ...(entry.loop ? { loop: true } : {}) };
  }
  return null;
}

/** Per-hour slower of several directions, for the "all directions" view. */
export function slowerOfSeries(series: readonly TripTimeSeries[]): TripTimeSeries | null {
  if (series.length === 0) return null;
  const byHour: TripMinutesByHour = {};
  for (const hour of SPARKLINE_HOURS) {
    const values = series.map(s => s.byHour[hour]).filter((v): v is number => v != null);
    if (values.length > 0) byHour[hour] = Math.max(...values);
  }
  return Object.keys(byHour).length > 0 ? { byHour, loop: series.some(s => s.loop) || undefined } : null;
}

/**
 * A trip-time bar's height in the strip: proportional to the trip time itself, from zero, with the
 * longest trip time at full height (CIV-493). A range-stretched scale made 45 vs 60 min look like 4x.
 */
export function tripTimeBarHeight(minutes: number, max: number, stripHeight: number): number {
  if (!(max > 0)) return 0;
  return Math.max(2, Math.round((minutes / max) * stripHeight));
}
