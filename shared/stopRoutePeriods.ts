import { MINUTES_PER_DAY, PERIOD_KEYS, PERIOD_MINUTES, type PeriodKey } from './config';
import { DAY_TYPES, type DayType } from './dayTypes';

/**
 * CIV-1052: which periods each route stops at a stop in, per day type, so the stop card can say
 * "No trips from {range}" only where the schedule proves the route has none. One number per
 * route on the stop point (`routePeriodBits`, parallel to `routeIds`): bit day * 6 + period, in
 * DAY_TYPES and PERIOD_KEYS order (Weekday amPeak is bit 0, Sunday overnight bit 17).
 */

export function stopRoutePeriodBit(day: DayType, period: PeriodKey): number {
  return 1 << (DAY_TYPES.indexOf(day) * PERIOD_KEYS.length + PERIOD_KEYS.indexOf(period));
}

/** The day's bits for every period a visit between these minutes (inclusive) can fall in; an early time can also be the night before (02:00 as 26:00). */
export function stopRoutePeriodBitsForSpan(day: DayType, start: number, end: number): number {
  let bits = 0;
  for (const key of PERIOD_KEYS) {
    const { start: ps, end: pe } = PERIOD_MINUTES[key];
    for (const shift of [0, MINUTES_PER_DAY, -MINUTES_PER_DAY]) {
      if (start + shift < pe && end + shift >= ps) bits |= stopRoutePeriodBit(day, key);
    }
  }
  return bits;
}

/**
 * Whether the routes' stop points prove no trip in the period: false when any bit is set, true when every
 * value is known and none is set, null when any value is missing (data from before the field: no claim).
 */
export function noTripsInPeriod(values: ReadonlyArray<number | null | undefined>, day: DayType, period: PeriodKey): boolean | null {
  if (values.length === 0 || values.some(v => typeof v !== 'number')) return null;
  const bit = stopRoutePeriodBit(day, period);
  return !values.some(v => ((v as number) & bit) !== 0);
}
