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
  lastRefreshedAt?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
}

/** Production-visible excludes staged and explicitly hidden agencies. */
export function isProductionVisibleFeed(agency: FeedAvailabilityEntry): boolean {
  return !agency.staged && !agency.hiddenInProduction;
}

/** The latest snapshot Atlas has published, whether current or stale. */
export function isActiveProductionFeed(agency: FeedAvailabilityEntry, today = todayUtcYmd()): boolean {
  return isProductionVisibleFeed(agency) && (
    (typeof agency.lastRefreshedAt === 'string' && agency.lastRefreshedAt.length > 0) ||
    isCurrentFeedExpiry(agency.lastFeedExpiry, today)
  );
}

/** Production-visible and current through the requested UTC date. */
export function isCurrentProductionFeed(
  agency: FeedAvailabilityEntry,
  today = todayUtcYmd(),
): boolean {
  return isActiveProductionFeed(agency, today) && isCurrentFeedExpiry(agency.lastFeedExpiry, today);
}

/** An active production feed whose published schedule may be outdated. */
export function isStaleProductionFeed(
  agency: FeedAvailabilityEntry,
  today = todayUtcYmd(),
): boolean {
  return isActiveProductionFeed(agency, today) && !isCurrentFeedExpiry(agency.lastFeedExpiry, today);
}
