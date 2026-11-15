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

/**
 * A day type inside a sentence, from one place (CIV-1569). The rule: "weekday" is a common word and is lower case
 * mid-sentence; Saturday and Sunday are names and keep their capital.
 * - `dayPlural` for "on …": "on weekdays", "on Saturdays", "on Sundays" ("This route has no trips on Saturdays.",
 *   "Running on weekdays").
 * - `dayInSentence` for one day before a noun: "weekday midday", "Saturday schedules".
 * Labels that stand alone (pickers, "Weekday" as a heading, the export's "Saturday midday") keep the DayType as is.
 */
const DAY_PLURALS: Record<DayType, string> = { Weekday: 'weekdays', Saturday: 'Saturdays', Sunday: 'Sundays' };
const DAYS_IN_SENTENCE: Record<DayType, string> = { Weekday: 'weekday', Saturday: 'Saturday', Sunday: 'Sunday' };

export function dayPlural(day: DayType): string {
  return DAY_PLURALS[day];
}

export function dayInSentence(day: DayType): string {
  return DAYS_IN_SENTENCE[day];
}

export function isDayType(value: string): value is DayType {
  return value in DAY_PLURALS;
}
