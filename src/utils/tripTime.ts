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

/** "5 p.m." for a GTFS hour (24 and up wrap past midnight). */
export function formatHourPlain(hour: number): string {
  const h24 = hour % 24;
  const suffix = h24 < 12 ? 'a.m.' : 'p.m.';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12} ${suffix}`;
}

/**
 * Plain-words summary line, or null when there is nothing to say.
 * "Trip time: 38–52 min, slowest 5 p.m." / "Trip time: about 41 min all day".
 */
export function tripTimeSummary(series: TripTimeSeries | null | undefined, label = 'Trip time'): string | null {
  if (!series) return null;
  const entries = SPARKLINE_HOURS
    .map(hour => [hour, series.byHour[hour]] as const)
    .filter((e): e is readonly [number, number] => e[1] != null);
  if (entries.length === 0) return null;
  const values = entries.map(([, m]) => m);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return `${label}: about ${min} min all day`;
  const slowest = entries.find(([, m]) => m === max)![0];
  return `${label}: ${min}–${max} min, slowest ${formatHourPlain(slowest)}`;
}

/** Hover text for one hour. */
export function tripTimeHourTitle(hour: number, minutes: number): string {
  return `${formatHourPlain(hour)}: about ${minutes} min`;
}
