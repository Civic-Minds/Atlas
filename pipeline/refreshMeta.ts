/**
 * Pure helpers for refresh.ts feed-metadata stamping and skip-if-unchanged.
 * Separated so unit tests can cover stamp decisions without R2.
 */

export interface FeedMetaFields {
  lastFeedExpiry?: string | null;
  lastFeedVersion?: string | null;
  lastRawArchiveKey?: string | null;
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

/** Never replace a dated active snapshot with an older or undated candidate. */
export function candidateIsOlderThanActive(opts: {
  candidateExpiry: string | null;
  existingExpiry?: string | null;
}): boolean {
  if (!opts.existingExpiry) return false;
  return !opts.candidateExpiry || opts.candidateExpiry < opts.existingExpiry;
}

/** Apply feed metadata after a successful non-empty refresh. */
export function stampFeedMeta(
  agency: FeedMetaFields,
  opts: {
    feedExpiry: string | null;
    feedVersion: string | null;
    rawArchiveKey: string;
    peekedExpiry: string | null;
    peekedVersion: string | null;
    todayYmd: string;
  },
): void {
  agency.lastFeedExpiry = opts.feedExpiry ?? opts.peekedExpiry ?? null;
  agency.lastFeedVersion = opts.feedVersion ?? opts.peekedVersion ?? null;
  agency.lastRawArchiveKey = opts.rawArchiveKey;
  agency.lastRefreshedAt = opts.todayYmd;
}

export type RefreshSkipReason =
  | { skip: true; reason: string }
  | { skip: false };

/**
 * Decide whether refresh can skip full reprocess for an unchanged feed.
 *
 * Rules (in order):
 * 1. Never skip under force, supplemental feeds, or an expired feed_end_date
 *    (expired always re-attempt so a fixed URL / fixed validator can unstick them).
 * 2. If feed_version is known on both sides and differs → reprocess
 *    (MBTA keeps feed_end_date constant while shipping mid-period edits).
 * 3. If feed_end_date is known on both sides and matches → skip only when
 *    version is also unknown or also matches.
 * 4. No expiry → skip only when version is known on both sides and matches.
 *
 * Historical bug: step 3 used to skip on matching expiry alone, so version
 * bumps never reached process/validation (stuck MBTA for weeks).
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
  if (opts.forceRefresh || opts.hasSupplementals || opts.feedExpired) {
    return { skip: false };
  }

  const { peekedExpiry, peekedVersion, lastFeedExpiry, lastFeedVersion } = opts;

  const versionKnown =
    peekedVersion != null &&
    peekedVersion !== '' &&
    lastFeedVersion != null &&
    lastFeedVersion !== '';
  if (versionKnown && peekedVersion !== lastFeedVersion) {
    return { skip: false };
  }

  if (peekedExpiry && lastFeedExpiry && peekedExpiry === lastFeedExpiry) {
    // Both versions known → only reachable here if they match (see above).
    // Either-side missing version still trusts expiry (no signal of a mid-period edit).
    if (!versionKnown || peekedVersion === lastFeedVersion) {
      return { skip: true, reason: `skipped (same schedule period: ${peekedExpiry})` };
    }
  }

  if (!peekedExpiry && versionKnown && peekedVersion === lastFeedVersion) {
    return { skip: true, reason: `skipped (same feed version: ${peekedVersion})` };
  }

  return { skip: false };
}
