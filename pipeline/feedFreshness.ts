function validYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{8}$/.test(value);
}

/**
 * Return the latest service date advertised anywhere in the feed.
 *
 * feed_info.txt is often left stale by agencies that keep extending their
 * calendar, so calendar.txt and added calendar_dates entries are authoritative
 * for deciding whether a feed still contains future service.
 */
export function effectiveFeedExpiry(opts: {
  feedInfoEnd?: unknown;
  calendarEnds?: unknown[];
  calendarDates?: Array<{ date?: unknown; exception_type?: unknown }>;
}): string | null {
  const dates: string[] = [];
  if (validYmd(opts.feedInfoEnd)) dates.push(opts.feedInfoEnd);
  for (const end of opts.calendarEnds ?? []) {
    if (validYmd(end)) dates.push(end);
  }
  for (const entry of opts.calendarDates ?? []) {
    if (String(entry.exception_type ?? '') === '2') continue;
    if (validYmd(entry.date)) dates.push(entry.date);
  }
  return dates.length ? dates.sort().at(-1)! : null;
}
