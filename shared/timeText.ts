/**
 * The app's one time format (CIV-1095; Ryan, 2026-10-28; docs/STYLE.md "Words"): "2–5 AM", "11 AM–3 PM",
 * "6:30–9 AM". Uppercase AM/PM after a space, an en dash between times, no ":00" on the hour, and AM/PM
 * once when both times share it. Every time and time range the UI shows comes from here.
 */

const MINUTES_PER_DAY = 1440;
const HALF_DAY = 720;

/** Whole minutes (frequencies.txt spacing can leave fractional times, 7:45.5). */
const whole = (minutes: number): number => Math.round(minutes);

const clockParts = (minutes: number): { clock: string; suffix: 'AM' | 'PM' } => {
  const m = ((whole(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(m / 60);
  const mins = m % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { clock: mins ? `${hour12}:${String(mins).padStart(2, '0')}` : String(hour12), suffix: hour24 < 12 ? 'AM' : 'PM' };
};

/** Minutes after midnight (GTFS times past 24:00 too) as a time: "9 AM", "9:37 AM", "12 PM", "2 AM" for 26:00. */
export function clockTime(minutes: number): string {
  const { clock, suffix } = clockParts(minutes);
  return `${clock} ${suffix}`;
}

/** A GTFS hour (26 = 2 AM the next morning) as a time: "6 AM", "12 PM". */
export function hourTime(hour: number): string {
  return clockTime(hour * 60);
}

/**
 * Two times as one range: "2–5 AM", "11 AM–3 PM", "6:30–9 AM", "11 PM–2 AM". AM/PM shows once only when both
 * ends are in the same half of the same day, so 5 AM to 2 AM the next night still names both.
 */
export function timeRange(startMinutes: number, endMinutes: number): string {
  const start = clockParts(startMinutes);
  const end = clockParts(endMinutes);
  const sameHalf = Math.floor(whole(startMinutes) / HALF_DAY) === Math.floor(whole(endMinutes) / HALF_DAY);
  return sameHalf ? `${start.clock}–${end.clock} ${end.suffix}` : `${start.clock} ${start.suffix}–${end.clock} ${end.suffix}`;
}

/** Two GTFS hours as one range: hourRange(6, 9) is "6–9 AM", hourRange(23, 26) "11 PM–2 AM". */
export function hourRange(startHour: number, endHour: number): string {
  return timeRange(startHour * 60, endHour * 60);
}
