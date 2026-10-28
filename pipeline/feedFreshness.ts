import { isYmd } from '../shared/feedAvailability.js';

/**
 * Return the latest service date advertised anywhere in the feed: the latest of
 * feed_info.txt's feed_end_date, calendar.txt end dates and added calendar_dates
 * entries (removals are ignored).
 *
 * feed_info's end date counts here, so a feed whose feed_info outlasts its
 * calendar reads later than its last real service (Detroit People Mover:
 * calendar 2026-12-31, feed_info 2027-12-31, #1126). The recorded expiry caps
 * that with the calendar's own end (recordedFeedExpiry in refreshMeta.ts, #1039).
 */
export function effectiveFeedExpiry(opts: {
  feedInfoEnd?: unknown;
  calendarEnds?: unknown[];
  calendarDates?: Array<{ date?: unknown; exception_type?: unknown }>;
}): string | null {
  const dates: string[] = [];
  if (isYmd(opts.feedInfoEnd)) dates.push(opts.feedInfoEnd);
  for (const end of opts.calendarEnds ?? []) {
    if (isYmd(end)) dates.push(end);
  }
  for (const entry of opts.calendarDates ?? []) {
    if (String(entry.exception_type ?? '') === '2') continue;
    if (isYmd(entry.date)) dates.push(entry.date);
  }
  return dates.length ? dates.sort().at(-1)! : null;
}

/**
 * Return the first date the feed offers service: the earliest calendar.txt
 * start_date or added calendar_dates entry, falling back to feed_info
 * feed_start_date when the feed has neither.
 */
export function effectiveFeedStart(opts: {
  feedInfoStart?: unknown;
  calendarStarts?: unknown[];
  calendarDates?: Array<{ date?: unknown; exception_type?: unknown }>;
}): string | null {
  const dates: string[] = [];
  for (const start of opts.calendarStarts ?? []) {
    if (isYmd(start)) dates.push(start);
  }
  for (const entry of opts.calendarDates ?? []) {
    if (String(entry.exception_type ?? '') === '2') continue;
    if (isYmd(entry.date)) dates.push(entry.date);
  }
  if (dates.length) return dates.sort()[0];
  return isYmd(opts.feedInfoStart) ? opts.feedInfoStart : null;
}
