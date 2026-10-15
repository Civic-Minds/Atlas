/**
 * Pure helpers for refresh.ts feed-metadata stamping.
 * Separated so unit tests can cover stamp decisions without R2.
 */
import type { SupplementalFeedMeta } from '../shared/feedAvailability.js';

export interface FeedMetaFields {
  lastFeedExpiry?: string | null;
  /** The feed's own latest service date, uncapped. lastFeedExpiry caps placeholder dates, so it can't detect an unchanged feed (#688). */
  lastPeekedExpiry?: string | null;
  lastFeedVersion?: string | null;
  lastRawArchiveKey?: string | null;
  lastRefreshedAt?: string | null;
  lastFeedCheckAt?: string | null;
  feedRefreshStatus?: 'current' | 'stale';
  feedRefreshError?: string | null;
  feedRefreshErrorAt?: string | null;
  feedRefreshRetryCount?: number;
  lastSupplementalFeeds?: SupplementalFeedMeta[];
}

/** Whether a feed's declared service end date is before the refresh date. */
export function isFeedExpired(feedExpiry: string | null | undefined, todayYmd: string): boolean {
  return !!feedExpiry && /^\d{8}$/.test(feedExpiry) && feedExpiry < todayYmd;
}

/** Replace known expired data only with a dated candidate that is current. */
export function shouldReplaceExpiredFeed(opts: {
  selectedExpiry: string | null | undefined;
  candidateExpiry: string | null | undefined;
  todayYmd: string;
}): boolean {
  return isFeedExpired(opts.selectedExpiry, opts.todayYmd)
    && !!opts.candidateExpiry
    && !isFeedExpired(opts.candidateExpiry, opts.todayYmd);
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

/**
 * Number of distinct routes drawn as lines in a route artifact. The processed featureCount also
 * counts stop points, so a feed whose trips have no shapes (El Monte, #634) passed the
 * zero-feature guards with stops only and was stamped "current" with 0 routes.
 */
export function routeLineCount(geojson: string): number {
  const features = (JSON.parse(geojson) as { features?: Array<{ geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }> }).features ?? [];
  const routes = new Set<string>();
  for (const feature of features) {
    const type = feature.geometry?.type;
    if ((type === 'LineString' || type === 'MultiLineString') && feature.properties?.routeId != null) {
      routes.add(String(feature.properties.routeId));
    }
  }
  return routes.size;
}

const YMD = /^\d{8}$/;
const validYmd = (d: string | null | undefined): d is string => !!d && YMD.test(d);

/** Placeholder calendar ends (e.g. 20500101) are capped this far out. */
export const PLACEHOLDER_EXPIRY_YEARS = 2;

/** YYYYMMDD (or YYYY-MM-DD) plus whole years, as YYYYMMDD. */
export function addYearsYmd(ymd: string, years: number): string {
  const d = ymd.replace(/-/g, '');
  return `${Number(d.slice(0, 4)) + years}${d.slice(4, 8)}`;
}

/**
 * The expiry to record for a refreshed feed. The processed expiry comes from
 * feed_info.txt only, while the peeked expiry also counts calendar.txt and
 * calendar_dates.txt. Agencies often leave feed_info stale while extending
 * their calendar, so the calendar end is used, but capped at feed_info end + 2
 * years and today + 2 years (today + 2 years alone without feed_info), so a
 * placeholder far-future end never stops an agency from showing as outdated.
 * The recorded value is the later of feed_info end and that capped end.
 * A placeholder calendar (ending more than 2 years after today) says nothing
 * about when service ends, so feed_info end wins outright when there is one
 * (#875: Simi Valley's 20230601 zip, feed_info 20250601 and a 20301231
 * calendar, read as current to 20270601).
 * Every expiry check reads this: refresh and reprocess record it in index.json,
 * the reprocess date check and the release gate compare it with today.
 */
export function recordedFeedExpiry(feedExpiry: string | null, peekedExpiry: string | null, todayYmd: string): string | null {
  const today = todayYmd.replace(/-/g, '');
  if (validYmd(feedExpiry) && validYmd(peekedExpiry) && peekedExpiry > addYearsYmd(today, PLACEHOLDER_EXPIRY_YEARS)) return feedExpiry;
  const limits = [addYearsYmd(today, PLACEHOLDER_EXPIRY_YEARS)];
  if (validYmd(feedExpiry)) limits.push(addYearsYmd(feedExpiry, PLACEHOLDER_EXPIRY_YEARS));
  const capped = validYmd(peekedExpiry) ? [peekedExpiry, ...limits].sort()[0] : null;
  const valid = [feedExpiry, capped].filter(validYmd);
  if (valid.length) return valid.sort().at(-1)!;
  return feedExpiry ?? peekedExpiry ?? null;
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
  agency.lastFeedExpiry = recordedFeedExpiry(opts.feedExpiry, opts.peekedExpiry, opts.todayYmd);
  agency.lastPeekedExpiry = opts.peekedExpiry;
  agency.lastFeedVersion = opts.feedVersion ?? opts.peekedVersion ?? null;
  agency.lastRefreshedAt = opts.todayYmd;
  agency.feedRefreshStatus = 'current';
  agency.feedRefreshError = null;
  agency.feedRefreshErrorAt = null;
  agency.feedRefreshRetryCount = 0;
}

/**
 * After reprocess-derived-artifacts publishes an agency, record the expiry of the feed it was
 * built from, with the same placeholder cap as a refresh. Without this, index.json kept the
 * expiry of an older feed: publish-data-release then blocked mcts and sfmta as "service ended"
 * and the site showed false expired notices (#837). Only the expiry fields change; the refresh
 * bookkeeping (version, archive key, refresh date) stays with refresh. Returns whether anything
 * changed, so unchanged agencies leave their files alone.
 */
export function stampReprocessedFeedExpiry(
  agency: Pick<FeedMetaFields, 'lastFeedExpiry' | 'lastPeekedExpiry'>,
  opts: { feedExpiry: string | null; calendarExpiry: string | null; todayYmd: string },
): boolean {
  const lastFeedExpiry = recordedFeedExpiry(opts.feedExpiry, opts.calendarExpiry, opts.todayYmd);
  if (lastFeedExpiry == null) return false;
  const lastPeekedExpiry = opts.calendarExpiry ?? agency.lastPeekedExpiry ?? null;
  if (agency.lastFeedExpiry === lastFeedExpiry && (agency.lastPeekedExpiry ?? null) === lastPeekedExpiry) return false;
  agency.lastFeedExpiry = lastFeedExpiry;
  agency.lastPeekedExpiry = lastPeekedExpiry;
  return true;
}

/**
 * Record each supplemental feed's expiry, version and raw archive key next to
 * the main feed's lastFeed* fields, in supplementalFeedUrls order. Freshness
 * checks read these through effectiveFeedExpiry so an expired supplemental
 * (e.g. a separate rail feed) marks the agency outdated (#630).
 */
export function stampSupplementalFeedMeta(agency: FeedMetaFields, feeds: SupplementalFeedMeta[]): void {
  if (feeds.length === 0) {
    delete agency.lastSupplementalFeeds;
    return;
  }
  agency.lastSupplementalFeeds = feeds.map(({ feedExpiry, feedVersion, rawArchiveKey }) => ({ feedExpiry, feedVersion, rawArchiveKey }));
}

/** Preserve the last good artifact while recording that a refresh needs another attempt. */
export function markFeedStale(
  agency: FeedMetaFields,
  opts: { reason: string; todayYmd: string },
): void {
  agency.lastFeedCheckAt = opts.todayYmd;
  agency.feedRefreshStatus = 'stale';
  agency.feedRefreshError = opts.reason;
  agency.feedRefreshErrorAt = opts.todayYmd;
  agency.feedRefreshRetryCount = (agency.feedRefreshRetryCount ?? 0) + 1;
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
  /** Uncapped expiry stored at the last refresh; the right key to compare a raw peek against (#688). */
  lastPeekedExpiry?: string | null;
  lastFeedVersion?: string | null;
  /** The agency reads its feed as of the run date (#774), so an unchanged feed still has new output. */
  referenceDateFromRunDate?: boolean;
}): RefreshSkipReason {
  if (opts.forceRefresh || opts.hasSupplementals || opts.feedExpired || opts.referenceDateFromRunDate) return { skip: false };
  const { peekedExpiry, peekedVersion, lastFeedVersion } = opts;
  // Older records have no uncapped value; compare against the recorded one as before.
  const lastFeedExpiry = opts.lastPeekedExpiry ?? opts.lastFeedExpiry;
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

/**
 * A staged agency stays staged until a refresh actually published its data.
 * Stale, unchanged and refused results published nothing, so un-staging then
 * would expose an agency with nothing to render.
 */
export function shouldClearStaged(result: { processed?: boolean }): boolean {
  return result.processed === true;
}
