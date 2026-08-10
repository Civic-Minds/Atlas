/** Whether a published feed has service through the requested UTC date. */
export function isCurrentFeedExpiry(expiry: string | null | undefined, today = todayUtcYmd()): boolean {
  return typeof expiry === 'string' && /^\d{8}$/.test(expiry) && expiry >= today;
}

/** UTC calendar date in the same YYYYMMDD form used by GTFS metadata. */
export function todayUtcYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

export interface FeedAvailabilityEntry {
  lastFeedExpiry?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
}

/** Production-visible means both published and current; unknown expiry is not current. */
export function isCurrentProductionFeed(
  agency: FeedAvailabilityEntry,
  today = todayUtcYmd(),
): boolean {
  return !agency.staged && !agency.hiddenInProduction && isCurrentFeedExpiry(agency.lastFeedExpiry, today);
}
