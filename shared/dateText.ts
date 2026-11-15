/**
 * Every date the site shows, written in one place (CIV-1569).
 *
 * The rule:
 * - shortDate: "Oct 12, 2026". The month's three-letter name, the day, a comma and the year. Notices, cards, agency
 *   and area page footers, What's new, the changelog and the export image.
 * - longDate: "November 3, 2026". The month in full. A research page's method box and its "Date updated" lines.
 * - dateRange: "Oct 8–14", or "Sep 30–Oct 14" across months, with an en dash and no year; one day reads "Oct 8".
 *   Live's weeks, days and "data up to" lines.
 * Each takes an ISO date ("2026-10-12", a timestamp's date part counts) or a feed's yyyymmdd ("20261012"), and
 * shortDate / longDate give null for anything else. Never type a date by hand or build one with toLocaleDateString.
 */

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Year, month (1–12) and day of an ISO or yyyymmdd date, or null when it isn't one. */
function dateParts(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const m = value ? /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value) : null;
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { year, month, day } : null;
}

/** "Oct 12, 2026"; null when the value isn't a date. */
export function shortDate(value: string | null | undefined): string | null {
  const p = dateParts(value);
  return p ? `${SHORT_MONTHS[p.month - 1]} ${p.day}, ${p.year}` : null;
}

/** "November 3, 2026"; null when the value isn't a date. */
export function longDate(value: string | null | undefined): string | null {
  const p = dateParts(value);
  return p ? `${LONG_MONTHS[p.month - 1]} ${p.day}, ${p.year}` : null;
}

/** "Oct 8–14", "Sep 30–Oct 14" across months, "Oct 8" for one day; from two ISO dates. */
export function dateRange(first: string, last: string): string {
  const a = dateParts(first);
  const b = dateParts(last);
  if (!a || !b) return '';
  const start = `${SHORT_MONTHS[a.month - 1]} ${a.day}`;
  if (first === last) return start;
  return a.month === b.month ? `${start}–${b.day}` : `${start}–${SHORT_MONTHS[b.month - 1]} ${b.day}`;
}
