/**
 * CIV-3115: how old a feed's timetable is, for feeds that give no end date (DECISIONS 2026-11-27). One rule for the agency
 * page and the MCP.
 */
import { TIMETABLE_STALE_MONTHS } from './config';

const ymdParts = (value: string | null | undefined): [number, number, number] | null => {
  const m = value ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Whether the timetable last changed TIMETABLE_STALE_MONTHS or more before today (both YYYYMMDD or ISO). */
export function isTimetableStale(changedAt: string | null | undefined, todayYmd: string): boolean {
  const c = ymdParts(changedAt), t = ymdParts(todayYmd);
  if (!c || !t) return false;
  const months = (t[0] - c[0]) * 12 + (t[1] - c[1]) - (t[2] < c[2] ? 1 : 0);
  return months >= TIMETABLE_STALE_MONTHS;
}

/** "February 2022" from a YYYYMMDD or ISO date; null when unusable. */
export function monthYear(value: string | null | undefined): string | null {
  const p = ymdParts(value);
  if (!p) return null;
  return new Date(Date.UTC(p[0], p[1] - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
