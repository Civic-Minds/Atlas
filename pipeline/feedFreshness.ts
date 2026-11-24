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
 * #1768: the feed's calendar rows and calendar_dates entries for service_ids at least one trip runs on. A service_id
 * with no trips advertises days with nothing running (Kingston: service 1994 listed to 2027-11-15, no trips; nothing
 * runs after 2027-01-03), so its dates must not set the feed's end. Unchanged when the trips name no service, or
 * when none of the calendar's services has a trip (an unreadable or mismatched trips file is no evidence).
 */
export function calendarWithTrips<C extends { service_id?: string }, D extends { service_id?: string }>(
  calendar: readonly C[],
  calendarDates: readonly D[],
  tripServiceIds: Iterable<string | undefined>,
): { calendar: C[]; calendarDates: D[] } {
  const used = new Set<string>();
  for (const id of tripServiceIds) if (id != null && id.trim()) used.add(id.trim());
  const has = (row: { service_id?: string }) => used.has(String(row.service_id ?? '').trim());
  const kept = { calendar: calendar.filter(has), calendarDates: calendarDates.filter(has) };
  if (used.size === 0 || (kept.calendar.length === 0 && kept.calendarDates.length === 0)) return { calendar: [...calendar], calendarDates: [...calendarDates] };
  return kept;
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
