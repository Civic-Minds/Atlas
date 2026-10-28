import type { DayType } from '../shared/dayTypes.js';
import { computePeriodCoverageHeadways, computePeriodHeadways, computePeriodMaxGaps, computePeriodSustained, forCrossMidnightWindow, HEADLINE_WINDOWS, sparseOvernightHeadway } from './headway-utils.js';
import { asNextNight, MINUTES_PER_DAY, TIME_PERIODS } from '../shared/config.js';

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
  if (!nextDay || !own.some(t => t >= MINUTES_PER_DAY)) return [...own];
  const night = own.filter(t => t >= MINUTES_PER_DAY);
  // Only the next day's trips after the night's last own trip: where the two timetables overlap
  // (Saturday hourly to 29:00, Sunday's 02:03 onward) adding both would read as every 3.
  const last = Math.max(...night);
  return [...night, ...asNextNight(nextDay).filter(t => t > last)];
}

/**
 * A night route direction (#896): no departure 09:00-19:00 at any of its stops that day, and it runs
 * at night, a departure from 23:00 or written past 24:00. An early departure alone (a morning-only
 * route from 03:45) is not a night.
 */
export function isNightRouteDirection(stopTimes: Iterable<readonly number[]>): boolean {
  const all = [...stopTimes];
  return !all.some(times => times.some(t => t >= HEADLINE_WINDOWS.midday.start && t < HEADLINE_WINDOWS.pmPeak.end)) && all.some(times => times.some(t => t >= 1380));
}

/**
 * The overnight period's headway, coverage, longest gap and sustained flag for `times`. A sparse
 * window (#897) reads no headway; `withheld` keeps its value for the comparisons that pick a source.
 */
export function overnightPeriodValues(times: number[], nightStartedUpstream = false) {
  return {
    headway: computePeriodHeadways(times).overnight ?? null,
    withheld: sparseOvernightHeadway(times),
    coverage: computePeriodCoverageHeadways(times).overnight ?? null,
    maxGap: (nightStartedUpstream ? overnightMaxGapAfterFirstBus(times) : computePeriodMaxGaps(times).overnight) ?? null,
    sustained: computePeriodSustained(times).overnight,
  };
}

const OVERNIGHT = TIME_PERIODS.find(p => p.key === 'overnight')!;
const OVERNIGHT_START = OVERNIGHT.startHour * 60;
/** A departure from 23:00 on is the night's (as isNightRouteDirection reads it). */
const NIGHT_FROM = 1380;

/**
 * Whether the night's trips leave their first stops before the overnight window opens (#1121). A stop down the line then
 * gets its first night bus later only because of the ride there, not because the night starts later.
 */
export function nightStartsBeforeWindow(tripStarts: readonly number[]): boolean {
  return tripStarts.some(t => t >= 1380 && t < OVERNIGHT_START);
}

/**
 * The overnight window's longest gap at a stop, leaving out the stretch from the window's start to the stop's first
 * departure in it (#1121). TTC 300 to West Mall leaves Bloor and Sherbourne from 25:51 every 15 and reaches Bloor and
 * Acorn from 26:30: the window's first half hour there is the ride from where the night begins, not a 30-minute gap.
 * Only for a night already running upstream, at a stop whose previous bus is a daytime trip; a gap between two of the
 * stop's departures, a night bus before the window included, always counts.
 */
export function overnightMaxGapAfterFirstBus(times: readonly number[]): number | null {
  const all = forCrossMidnightWindow([...times], OVERNIGHT.endHour * 60);
  const firstIn = Math.min(...all.filter(t => t >= OVERNIGHT_START));
  if (!Number.isFinite(firstIn)) return computePeriodMaxGaps([...times]).overnight ?? null;
  // A night bus just before the window makes the wait to the first one in it real (STM 350 at Léger and Newman: 25:59,
  // then 26:40); only a stop whose previous bus is a daytime trip gets its first night bus late by the ride alone.
  const before = all.filter(t => t < firstIn);
  if (before.length > 0 && Math.max(...before) >= NIGHT_FROM) return computePeriodMaxGaps([...times]).overnight ?? null;
  // Dropping every time before the stop's first one in the window leaves its gaps from that bus on. A stop with one
  // night departure has no gap of its own, so it keeps the window's reading.
  const fromFirst = all.filter(t => t >= firstIn);
  if (new Set(fromFirst).size < 2) return computePeriodMaxGaps([...times]).overnight ?? null;
  return computePeriodMaxGaps(fromFirst).overnight ?? null;
}
