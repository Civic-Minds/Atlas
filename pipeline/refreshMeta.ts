/**
 * Pure helpers for refresh.ts feed-metadata stamping.
 * Separated so unit tests can cover stamp decisions without R2.
 */

export interface FeedMetaFields {
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  lastRefreshedAt?: string | null;
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
