/**
 * Pure helpers for refresh.ts feed-metadata stamping.
 * Separated so unit tests can cover stamp decisions without R2.
 */
import { isExpiredFeedExpiry, isYmd, type SupplementalFeedMeta } from '../shared/feedAvailability.js';

export interface FeedMetaFields {
  lastFeedExpiry?: string | null;
  /** CIV-1011 stage 4: the picked week's key at the last refresh (serviceWeekKey). */
  lastServiceWeek?: string | null;
  /** When Atlas first obtained the current main feed file (YYYYMMDD); the listing-end safeguard reads it. */
  feedObtainedAt?: string | null;
  /** CIV-1011: the date most routes stopped being listed with nothing replacing them (YYYYMMDD); the agency shows Ryan's notice. Absent otherwise. */
  listingEndedOn?: string | null;
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
  /** A fetched timetable starting on this date waits until then (#1144); cleared once one is processed. */
  heldFeedStart?: string | null;
  /** CIV-1223: the zips the release gate last refused (feedSetSha256); cleared once a feed is processed. */
  refusedFeedSha256?: string | null;
}

/** Whether a feed's declared service end date is before the refresh date. */
export function isFeedExpired(feedExpiry: string | null | undefined, todayYmd: string): boolean {
  return isExpiredFeedExpiry(feedExpiry, todayYmd);
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
  const knownExpiries = feedExpiries.filter(isYmd);
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
 * The calendar's own last real service date (calendarOnlyEnd: calendar.txt and added
 * calendar_dates, without feed_info) can only lower the result, never raise it, so a
 * feed_info end claiming 20350201 cannot keep a calendar that ended 20250531 current
 * (#1039, MAX). It is ignored when it is itself a placeholder (past today + 2 years).
 * Every expiry check reads this: refresh and reprocess record it in index.json,
 * the reprocess date check and the release gate compare it with today.
 */
export function recordedFeedExpiry(feedExpiry: string | null, peekedExpiry: string | null, todayYmd: string, calendarOnlyEnd?: string | null): string | null {
  const recorded = laterOfFeedInfoAndCappedCalendar(feedExpiry, peekedExpiry, todayYmd);
  const calendarCap = addYearsYmd(todayYmd.replace(/-/g, ''), PLACEHOLDER_EXPIRY_YEARS);
  if (isYmd(recorded) && isYmd(calendarOnlyEnd) && calendarOnlyEnd <= calendarCap && calendarOnlyEnd < recorded) return calendarOnlyEnd;
  return recorded;
}

function laterOfFeedInfoAndCappedCalendar(feedExpiry: string | null, peekedExpiry: string | null, todayYmd: string): string | null {
  const today = todayYmd.replace(/-/g, '');
  if (isYmd(feedExpiry) && isYmd(peekedExpiry) && peekedExpiry > addYearsYmd(today, PLACEHOLDER_EXPIRY_YEARS)) return feedExpiry;
  const limits = [addYearsYmd(today, PLACEHOLDER_EXPIRY_YEARS)];
  if (isYmd(feedExpiry)) limits.push(addYearsYmd(feedExpiry, PLACEHOLDER_EXPIRY_YEARS));
  const capped = isYmd(peekedExpiry) ? [peekedExpiry, ...limits].sort()[0] : null;
  const valid = [feedExpiry, capped].filter(isYmd);
  if (valid.length) return valid.sort().at(-1)!;
  return feedExpiry ?? peekedExpiry ?? null;
}

/**
 * A refresh that skips an unchanged feed records nothing new, so an expiry stored before a rule
 * change stayed as it was: MAX kept feed_info's 20350201 after #1039 taught recordedFeedExpiry to
 * use the calendar's last service date (20250531), and no expired notice showed (CIV-443). The
 * skip path calls this to record the expiry today's rule gives the same feed, only ever lowering
 * it (a raise waits for a real refresh). Returns the old value when it changed, else null.
 */
export function lowerStoredFeedExpiry(
  agency: Pick<FeedMetaFields, 'lastFeedExpiry'>,
  opts: { feedInfoEnd: string | null; calendarEnd: string | null; calendarOnlyEnd: string | null; todayYmd: string },
): string | null {
  const recorded = recordedFeedExpiry(opts.feedInfoEnd, opts.calendarEnd, opts.todayYmd, opts.calendarOnlyEnd);
  const stored = agency.lastFeedExpiry ?? null;
  // Only the #1039 case: today's value is the calendar's own last service date. A lower value from
  // the placeholder cap (today + 2 years) moves every week and says nothing new.
  if (!isYmd(recorded) || !isYmd(stored) || recorded >= stored || recorded !== opts.calendarOnlyEnd) return null;
  agency.lastFeedExpiry = recorded;
  return stored;
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
    /** The kept routes' latest service date (#1140); without it, the raw peeked expiry. */
    calendarExpiry?: string | null;
    /** Last real service date from the calendar alone (no feed_info); can only lower the expiry. */
    calendarOnlyEnd?: string | null;
    /** The processed feed's listing end (ProcessResult.listingEnd); cleared when null. */
    listingEnd?: string | null;
    /** The picked week's key (serviceWeekKey), for the next refresh's unchanged check. */
    serviceWeek?: string | null;
    /** When Atlas first obtained this file (YYYYMMDD), for the listing-end safeguard. */
    feedObtainedAt?: string | null;
  },
): void {
  agency.lastFeedExpiry = recordedFeedExpiry(opts.feedExpiry, opts.calendarExpiry !== undefined ? opts.calendarExpiry : opts.peekedExpiry, opts.todayYmd, opts.calendarOnlyEnd);
  agency.lastPeekedExpiry = opts.peekedExpiry;
  agency.lastFeedVersion = opts.feedVersion ?? opts.peekedVersion ?? null;
  agency.lastRefreshedAt = opts.todayYmd;
  agency.feedRefreshStatus = 'current';
  agency.feedRefreshError = null;
  agency.feedRefreshErrorAt = null;
  agency.feedRefreshRetryCount = 0;
  delete agency.heldFeedStart;
  delete agency.refusedFeedSha256;
  stampListingEnd(agency, opts.listingEnd);
  if (opts.serviceWeek) agency.lastServiceWeek = opts.serviceWeek;
  else if (opts.serviceWeek === null) delete agency.lastServiceWeek;
  if (opts.feedObtainedAt) agency.feedObtainedAt = opts.feedObtainedAt;
}

/** Record or clear the CIV-1011 listing end. Returns whether it changed. */
export function stampListingEnd(agency: Pick<FeedMetaFields, 'listingEndedOn'>, listingEnd: string | null | undefined): boolean {
  const next = listingEnd && /^\d{8}$/.test(listingEnd) ? listingEnd : null;
  if ((agency.listingEndedOn ?? null) === next) return false;
  if (next) agency.listingEndedOn = next;
  else delete agency.listingEndedOn;
  return true;
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
  agency: Pick<FeedMetaFields, 'lastFeedExpiry' | 'lastPeekedExpiry' | 'listingEndedOn'>,
  opts: { feedExpiry: string | null; calendarExpiry: string | null; todayYmd: string; calendarOnlyEnd?: string | null; listingEnd?: string | null },
): boolean {
  const lastFeedExpiry = recordedFeedExpiry(opts.feedExpiry, opts.calendarExpiry, opts.todayYmd, opts.calendarOnlyEnd);
  if (lastFeedExpiry == null) return false;
  const listingChanged = opts.listingEnd !== undefined && stampListingEnd(agency, opts.listingEnd);
  const lastPeekedExpiry = opts.calendarExpiry ?? agency.lastPeekedExpiry ?? null;
  if (agency.lastFeedExpiry === lastFeedExpiry && (agency.lastPeekedExpiry ?? null) === lastPeekedExpiry) return listingChanged;
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
  /**
   * The agency reads its feed as of the run date on the old picker (#774), so an unchanged feed
   * still has new output. CIV-1101: only without a service-week key (the kill switch); with one,
   * a moved week reprocesses like any other agency.
   */
  referenceDateFromRunDate?: boolean;
  /** CIV-1011 stage 4: the picked week's key now (serviceWeekKey) and at the last refresh; a moved week reprocesses. */
  serviceWeek?: string | null;
  lastServiceWeek?: string | null;
}): RefreshSkipReason {
  if (opts.forceRefresh || opts.hasSupplementals || opts.feedExpired || (opts.referenceDateFromRunDate && !opts.serviceWeek)) return { skip: false };
  if (opts.serviceWeek && opts.serviceWeek !== (opts.lastServiceWeek ?? null)) return { skip: false };
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
