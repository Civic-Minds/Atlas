export type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type DayType = 'Weekday' | 'Saturday' | 'Sunday';

export const DAY_TYPES = ['Weekday', 'Saturday', 'Sunday'] as const satisfies readonly DayType[];

export function getNowDay(): DayType {
  const d = new Date().getDay();
  if (d === 0) return 'Sunday';
  if (d === 6) return 'Saturday';
  return 'Weekday';
}

export const ALL_DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const DAY_TO_TYPE: Record<DayName, DayType> = {
  Monday: 'Weekday', Tuesday: 'Weekday', Wednesday: 'Weekday',
  Thursday: 'Weekday', Friday: 'Weekday', Saturday: 'Saturday', Sunday: 'Sunday',
};
