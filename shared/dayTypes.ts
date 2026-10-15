export type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type DayType = 'Weekday' | 'Saturday' | 'Sunday';

export const DAY_TYPES = ['Weekday', 'Saturday', 'Sunday'] as const satisfies readonly DayType[];

export function getNowDay(): DayType {
  const d = new Date().getDay();
  if (d === 0) return 'Sunday';
  if (d === 6) return 'Saturday';
  return 'Weekday';
}

/**
 * The day to write into the address bar: null when it is today's default day (omitted for a short URL),
 * otherwise the day itself. The default is today's, not always Weekday: on a Saturday, Weekday must stay in the
 * address, or a reload or a copied link opens on Saturday (#909).
 */
export function dayUrlParam(day: DayType, today: DayType = getNowDay()): DayType | null {
  return day === today ? null : day;
}

export const ALL_DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const DAY_TO_TYPE: Record<DayName, DayType> = {
  Monday: 'Weekday', Tuesday: 'Weekday', Wednesday: 'Weekday',
  Thursday: 'Weekday', Friday: 'Weekday', Saturday: 'Saturday', Sunday: 'Sunday',
};
