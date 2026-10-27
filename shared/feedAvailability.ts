import { localDateIn } from './onDemandAvailability.js';

/**
 * Today's date (YYYYMMDD) where the agency is: every check of whether its feed has ended reads this
 * (Ryan, 2026-10-27), so the site, the refresh and the release gate agree near midnight. With no
 * time zone on file it is the last place on Earth to reach midnight (localDateIn), so a feed never
 * reads as ended before its last day is over anywhere.
 */
export function agencyTodayYmd(agency: { timezone?: string | null }, now: Date = new Date()): string {
  return localDateIn(agency.timezone, now).replace(/-/g, '');
}

/** Whether the agency's published service (every feed, effectiveFeedExpiry) has ended, in its own local date. */
export function isAgencyFeedExpired(agency: SupplementalFeedExpiryEntry & { timezone?: string | null }, now: Date = new Date()): boolean {
  return isExpiredFeedExpiry(effectiveFeedExpiry(agency), agencyTodayYmd(agency, now));
}

/** Whether a published feed has service through the requested date. */
export function isCurrentFeedExpiry(expiry: string | null | undefined, today = todayUtcYmd()): boolean {
  return typeof expiry === 'string' && /^\d{8}$/.test(expiry) && expiry >= today;
}

/**
 * Whether a feed's known service end date has passed. An undated feed (open-ended
 * calendar or no calendar end) is not expired, matching the frontend's isFeedExpired.
 */
export function isExpiredFeedExpiry(expiry: string | null | undefined, today = todayUtcYmd()): boolean {
  return typeof expiry === 'string' && /^\d{8}$/.test(expiry) && expiry < today;
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
  timezone?: string | null;
  lastRefreshedAt?: string | null;
  staged?: boolean;
  hiddenInProduction?: boolean;
}

/** Production-visible excludes staged and explicitly hidden agencies. */
export function isProductionVisibleFeed(agency: FeedAvailabilityEntry): boolean {
  return !agency.staged && !agency.hiddenInProduction;
}

/** The latest snapshot Atlas has published, whether current or stale. */
export function isActiveProductionFeed(agency: FeedAvailabilityEntry, today = agencyTodayYmd(agency)): boolean {
  return isProductionVisibleFeed(agency) && (
    (typeof agency.lastRefreshedAt === 'string' && agency.lastRefreshedAt.length > 0) ||
    isCurrentFeedExpiry(effectiveFeedExpiry(agency), today)
  );
}

/** Production-visible and current through the requested date (default: the agency's local today). */
export function isCurrentProductionFeed(
  agency: FeedAvailabilityEntry,
  today = agencyTodayYmd(agency),
): boolean {
  return isActiveProductionFeed(agency, today) && !isExpiredFeedExpiry(effectiveFeedExpiry(agency), today);
}

/** An active production feed whose published schedule may be outdated. */
export function isStaleProductionFeed(
  agency: FeedAvailabilityEntry,
  today = agencyTodayYmd(agency),
): boolean {
  return isActiveProductionFeed(agency, today) && isExpiredFeedExpiry(effectiveFeedExpiry(agency), today);
}

/**
 * Stale judged on the main feed alone. restore-active-feeds can only replace a
 * stale main feed from its archive, so an expired supplemental must not make a
 * current agency a restore target.
 */
export function isStalePrimaryProductionFeed(
  agency: FeedAvailabilityEntry,
  today = agencyTodayYmd(agency),
): boolean {
  return isStaleProductionFeed({ ...agency, lastSupplementalFeeds: undefined }, today);
}
