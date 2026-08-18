/**
 * Pure helpers for refresh.ts feed-metadata stamping.
 * Separated so unit tests can cover stamp decisions without R2.
 */

export interface FeedMetaFields {
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  lastRawArchiveKey?: string | null;
  lastRefreshedAt?: string | null;
}

/** Whether a feed's declared service end date is before the refresh date. */
export function isFeedExpired(feedExpiry: string | null | undefined, todayYmd: string): boolean {
  return !!feedExpiry && /^\d{8}$/.test(feedExpiry) && feedExpiry < todayYmd;
}

/**
 * Stop a scheduled refresh only when every feed part declares an expiry and all
 * of those dates are already past. An undated part is not enough evidence to
 * reject the update.
 */
export function shouldSkipAllExpiredFeeds(feedExpiries: Array<string | null | undefined>, todayYmd: string): boolean {
  const knownExpiries = feedExpiries.filter((expiry): expiry is string => !!expiry && /^\d{8}$/.test(expiry));
  return knownExpiries.length === feedExpiries.length
    && knownExpiries.length > 0
    && knownExpiries.every(expiry => isFeedExpired(expiry, todayYmd));
}

/**
 * Whether a successful refresh should update lastFeed* on the agency record.
 * Zero-feature and validation-failed runs must leave metadata alone so
 * skip-if-unchanged does not permanently ignore a bad extract.
 */
export function shouldStampFeedMeta(featureCount: number): boolean {
  return featureCount > 0;
}

/** Apply feed metadata after a successful non-empty refresh. */
export function stampFeedMeta(
  agency: FeedMetaFields,
  opts: {
    feedExpiry: string | null;
    feedVersion: string | null;
    peekedExpiry: string | null;
    peekedVersion: string | null;
    todayYmd: string;
  },
): void {
  agency.lastFeedExpiry = opts.feedExpiry ?? opts.peekedExpiry ?? null;
  agency.lastFeedVersion = opts.feedVersion ?? opts.peekedVersion ?? null;
  agency.lastRefreshedAt = opts.todayYmd;
}

/** Never replace a dated active snapshot with an older or undated candidate. */
export function candidateIsOlderThanActive(opts: {
  candidateExpiry: string | null;
  existingExpiry?: string | null;
}): boolean {
  if (!opts.existingExpiry) return false;
  return !opts.candidateExpiry || opts.candidateExpiry < opts.existingExpiry;
}

export type RefreshSkipReason =
  | { skip: true; reason: string }
  | { skip: false };

/**
 * Skip only when the feed identity is unchanged. An expiry-date match alone is
 * insufficient because agencies can publish a new feed_version mid-period.
 */
export function decideRefreshSkipUnchanged(opts: {
  forceRefresh: boolean;
  hasSupplementals: boolean;
  feedExpired: boolean;
  peekedExpiry: string | null;
  peekedVersion: string | null;
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
}): RefreshSkipReason {
  if (opts.forceRefresh || opts.hasSupplementals || opts.feedExpired) return { skip: false };
  const { peekedExpiry, peekedVersion, lastFeedExpiry, lastFeedVersion } = opts;
  const versionKnown = !!peekedVersion && !!lastFeedVersion;
  if (versionKnown && peekedVersion !== lastFeedVersion) return { skip: false };
  if (peekedExpiry && lastFeedExpiry && peekedExpiry === lastFeedExpiry) {
    return { skip: true, reason: `skipped (same schedule period: ${peekedExpiry})` };
  }
  if (!peekedExpiry && versionKnown && peekedVersion === lastFeedVersion) {
    return { skip: true, reason: `skipped (same feed version: ${peekedVersion})` };
  }
  return { skip: false };
}
