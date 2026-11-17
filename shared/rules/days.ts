/**
 * Every day list Atlas uses, in one place (rules audit 4.1, move 5): the three day types, the seven day names in
 * Monday-first and Sunday-first order, the GTFS calendar.txt day columns, short day labels, and a day type inside a
 * sentence. Imports nothing, so any bundle, the pipeline and the scripts can read it.
 */
export type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type DayType = 'Weekday' | 'Saturday' | 'Sunday';

export const DAY_TYPES = ['Weekday', 'Saturday', 'Sunday'] as const satisfies readonly DayType[];

/** The day type of a day of the week numbered as Date.getDay() numbers it (0 Sunday to 6 Saturday). */
export function dayTypeOfDow(dow: number): DayType {
  if (dow === 0) return 'Sunday';
  if (dow === 6) return 'Saturday';
  return 'Weekday';
}

export function getNowDay(): DayType {
  return dayTypeOfDow(new Date().getDay());
}

export const ALL_DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
/** The seven days Sunday first, so Date.getDay() indexes it. */
export const DAYS_SUNDAY_FIRST: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Short day labels, Monday first ("Mon–Fri"). */
export const SHORT_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** GTFS calendar.txt day columns, Monday first as the file lists them. */
export const CALENDAR_DAY_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
/** The same columns Sunday first, so Date.getDay() indexes it. */
export const CALENDAR_DAY_FIELDS_SUNDAY_FIRST = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
/** The five weekday columns. */
export const WEEKDAY_CALENDAR_FIELDS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

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
