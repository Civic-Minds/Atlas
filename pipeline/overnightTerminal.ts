import type { DayType } from '../shared/dayTypes.js';
import { computePeriodCoverageHeadways, computePeriodHeadways, computePeriodMaxGaps, computePeriodSustained, sparseOvernightHeadway } from './headway-utils.js';

/**
 * The day type whose early-morning trips carry on a day type's night (#896): Saturday night runs
 * into Sunday's timetable and Sunday night into the weekday one. A weekday night runs into the
 * next weekday's own timetable, so Weekday has none.
 */
export function nextServiceDay(day: DayType): DayType | null {
  if (day === 'Saturday') return 'Sunday';
  if (day === 'Sunday') return 'Weekday';
  return null;
}

/**
 * Departures in a day's overnight window (26:00-30:00). When the day's own trips run past
 * midnight, its night carries on into the next day's trips before 06:00, which take the place
 * of its own once its own trips end (#896): TTC 373 to Steeles runs every 30 on Saturday's timetable until 28:23, and
 * Sunday's 04:53 trip is the next bus, not a gap to 30:00. A day with no trips past midnight,
 * or no next-day departures to read, keeps its own times.
 */
export function overnightWindowTimes(own: readonly number[], nextDay: readonly number[] | undefined): number[] {
  if (!nextDay || !own.some(t => t >= 1440)) return [...own];
  const night = own.filter(t => t >= 1440);
  // Only the next day's trips after the night's last own trip: where the two timetables overlap
  // (Saturday hourly to 29:00, Sunday's 02:03 onward) adding both would read as every 3.
  const last = Math.max(...night);
  return [...night, ...nextDay.filter(t => t < 1440).map(t => t + 1440).filter(t => t > last)];
}

/**
 * A night route direction (#896): no departure 09:00-19:00 at any of its stops that day, and it runs
 * at night, a departure from 23:00 or written past 24:00. An early departure alone (a morning-only
 * route from 03:45) is not a night.
 */
export function isNightRouteDirection(stopTimes: Iterable<readonly number[]>): boolean {
  const all = [...stopTimes];
  return !all.some(times => times.some(t => t >= 540 && t < 1140)) && all.some(times => times.some(t => t >= 1380));
}

/**
 * The overnight period's headway, coverage, longest gap and sustained flag for `times`. A sparse
 * window (#897) reads no headway; `withheld` keeps its value for the comparisons that pick a source.
 */
export function overnightPeriodValues(times: number[]) {
  return {
    headway: computePeriodHeadways(times).overnight ?? null,
    withheld: sparseOvernightHeadway(times),
    coverage: computePeriodCoverageHeadways(times).overnight ?? null,
    maxGap: computePeriodMaxGaps(times).overnight ?? null,
    sustained: computePeriodSustained(times).overnight,
  };
}
