/** Whether a published feed has service through the requested UTC date. */
export function isCurrentFeedExpiry(expiry: string | null | undefined, today = todayUtcYmd()): boolean {
  return typeof expiry === 'string' && /^\d{8}$/.test(expiry) && expiry >= today;
}

/** UTC calendar date in the same YYYYMMDD form used by GTFS metadata. */
export function todayUtcYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Per-feed metadata for an agency's supplemental feeds, in `supplementalFeedUrls` order (no URLs: this ships to the browser). */
export interface SupplementalFeedMeta {
  feedExpiry: string | null;
  feedVersion: string | null;
  rawArchiveKey: string | null;
}

export interface SupplementalFeedExpiryEntry {
  lastFeedExpiry?: string | null;
  lastSupplementalFeeds?: SupplementalFeedMeta[];
}

/**
 * The date the agency's published service runs out: the earliest dated expiry
 * across the main feed and every supplemental feed. A separately published
 * rail feed that has ended makes the agency outdated even when its bus feed is
 * still current (#630).
 */
export function effectiveFeedExpiry(agency: SupplementalFeedExpiryEntry): string | null {
  const dated = [agency.lastFeedExpiry, ...(agency.lastSupplementalFeeds ?? []).map(feed => feed.feedExpiry)]
    .filter((expiry): expiry is string => typeof expiry === 'string' && /^\d{8}$/.test(expiry))
    .sort();
  return dated[0] ?? agency.lastFeedExpiry ?? null;
}

export interface FeedAvailabilityEntry extends SupplementalFeedExpiryEntry {
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
    isCurrentFeedExpiry(effectiveFeedExpiry(agency), today)
  );
}

/** Production-visible and current through the requested UTC date. */
export function isCurrentProductionFeed(
  agency: FeedAvailabilityEntry,
  today = todayUtcYmd(),
): boolean {
  return isActiveProductionFeed(agency, today) && isCurrentFeedExpiry(effectiveFeedExpiry(agency), today);
}

/** An active production feed whose published schedule may be outdated. */
export function isStaleProductionFeed(
  agency: FeedAvailabilityEntry,
  today = todayUtcYmd(),
): boolean {
  return isActiveProductionFeed(agency, today) && !isCurrentFeedExpiry(effectiveFeedExpiry(agency), today);
}
