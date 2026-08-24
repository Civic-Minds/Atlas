import { isFeedExpired } from './refreshMeta.js';

/** First automatic refresh run represented by the backfilled check history. */
export const FEED_CHECK_TRACKING_START = '20260622';

export interface FeedCheckFields {
  lastFeedCheckAt?: string | null;
  expiredFeedCheckCount?: number;
  expiredFeedCheckSince?: string | null;
  expiredFeedCheckExpiry?: string | null;
}

/** Record one downloaded feed inspection and count it when the feed is expired. */
export function recordFeedCheck(
  agency: FeedCheckFields,
  opts: { feedExpiry: string | null; todayYmd: string },
): void {
  agency.lastFeedCheckAt = opts.todayYmd;

  if (!isFeedExpired(opts.feedExpiry, opts.todayYmd)) {
    agency.expiredFeedCheckCount = 0;
    agency.expiredFeedCheckSince = null;
    agency.expiredFeedCheckExpiry = opts.feedExpiry;
    return;
  }

  if (agency.expiredFeedCheckExpiry !== opts.feedExpiry) {
    agency.expiredFeedCheckCount = 0;
    agency.expiredFeedCheckSince = FEED_CHECK_TRACKING_START;
    agency.expiredFeedCheckExpiry = opts.feedExpiry;
  }

  agency.expiredFeedCheckCount = (agency.expiredFeedCheckCount ?? 0) + 1;
  agency.expiredFeedCheckSince ??= FEED_CHECK_TRACKING_START;
}
