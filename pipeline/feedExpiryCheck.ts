/**
 * CIV-1223: the daily check for feeds about to run out. It picks the agencies whose recorded schedule (main or
 * supplemental feed) ends within a few days, plus every agency with a rolling feed (nextServiceDatesFeedUrls), peeks
 * each feed's end date the way refresh does (pickFeedSource for the main feed) and names only the agencies whose new
 * zip ends later than the recorded one. It reads and downloads only: no R2 writes, no dispatch.
 */
import { agencyTodayYmd, type SupplementalFeedMeta } from '../shared/feedAvailability.js';
import { isZipBuffer } from './agencyFeeds.js';
import { isCountryLaunchBlocked, resolveAgencyCountry, type AgencyCountrySource } from './countryLaunchGate.js';
import { peekFeedInfo, pickFeedSource } from './feedPeek.js';
import { buildFeedCandidates, type FeedCandidate } from './feedSourceCandidates.js';
import { resolveFeedUrl } from './feedUrl.js';

export interface ExpiryCheckAgency extends AgencyCountrySource {
  slug: string;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
  feedFallbackUrls?: string[];
  feedApiKeyEnvVar?: string;
  feedApiKeyParam?: string;
  timezone?: string | null;
  lastFeedExpiry?: string | null;
  /** The main feed's end date as refresh last peeked it (the same reading as peekFeedInfo). */
  lastPeekedExpiry?: string | null;
  supplementalFeedUrls?: string[];
  lastSupplementalFeeds?: SupplementalFeedMeta[];
  nextServiceDatesFeedUrls?: string[];
}

export interface FeedToPeek {
  kind: 'main' | 'supplemental';
  /** Sources in refresh's order; a supplemental has one. */
  candidates: FeedCandidate[];
  /** The recorded end date this feed is compared against (YYYYMMDD), or null when none is recorded. */
  recorded: string | null;
}

export interface ExpiryCandidate {
  slug: string;
  reason: string;
  timezone?: string | null;
  feeds: FeedToPeek[];
}

const later = (a: string | null | undefined, b: string | null | undefined): string | null =>
  a && b ? (a > b ? a : b) : a ?? b ?? null;

/** YYYYMMDD plus whole days. */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)) + days));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * The agencies to peek today. `pending` holds recorded values not yet on main (the open weekly refresh pull request),
 * so an agency already refreshed there is compared against its newer dates and not refreshed again.
 */
export function expiringFeedCandidates(
  agencies: ExpiryCheckAgency[],
  opts: { todayYmd: string; days: number; pending?: ExpiryCheckAgency[] },
): ExpiryCandidate[] {
  const horizon = addDaysYmd(opts.todayYmd, opts.days);
  const pendingBySlug = new Map((opts.pending ?? []).map(a => [a.slug, a]));
  const out: ExpiryCandidate[] = [];
  for (const agency of agencies) {
    if (!agency.feedUrl) continue;
    // Refresh skips these without the launch flag, so a check would pick them every day.
    if (isCountryLaunchBlocked(resolveAgencyCountry(agency), agencies)) continue;
    const pending = pendingBySlug.get(agency.slug);
    const mainRecorded = later(agency.lastPeekedExpiry ?? agency.lastFeedExpiry, pending?.lastPeekedExpiry ?? pending?.lastFeedExpiry);
    const supplementalRecorded = (agency.supplementalFeedUrls ?? []).map((_, i) =>
      later(agency.lastSupplementalFeeds?.[i]?.feedExpiry, pending?.lastSupplementalFeeds?.[i]?.feedExpiry));
    const reasons: string[] = [];
    if ((agency.nextServiceDatesFeedUrls?.length ?? 0) > 0) reasons.push('rolling feed');
    if (mainRecorded && mainRecorded <= horizon) reasons.push(`main ends ${mainRecorded}`);
    supplementalRecorded.forEach((end, i) => { if (end && end <= horizon) reasons.push(`supplemental ${i + 1} ends ${end}`); });
    if (reasons.length === 0) continue;
    let mainCandidates: FeedCandidate[];
    try {
      const configured = resolveFeedUrl(agency.feedUrl, agency.feedApiKeyEnvVar, agency.feedApiKeyParam);
      mainCandidates = buildFeedCandidates(configured, agency.mdbFeedUrl, agency.feedFallbackUrls);
    } catch {
      // A missing API key: the supplementals can still be peeked; the main feed is left to the weekly run.
      mainCandidates = [];
    }
    const feeds: FeedToPeek[] = [];
    if (mainCandidates.length > 0) feeds.push({ kind: 'main', candidates: mainCandidates, recorded: mainRecorded });
    (agency.supplementalFeedUrls ?? []).forEach((url, i) =>
      feeds.push({ kind: 'supplemental', candidates: [{ kind: 'configured', url }], recorded: supplementalRecorded[i] }));
    out.push({ slug: agency.slug, reason: reasons.join('; '), timezone: agency.timezone, feeds });
  }
  return out;
}

export interface PeekedFeed extends FeedToPeek { peeked: string | null; url: string | null; error?: string }
export interface CheckResult { slug: string; reason: string; newer: boolean; feeds: PeekedFeed[] }

/** A peeked end date counts only when it is later than a recorded one; nothing recorded, or nothing read, is no evidence. */
export function feedIsNewer(peeked: string | null, recorded: string | null): boolean {
  return peeked != null && recorded != null && peeked > recorded;
}

/**
 * Peek one candidate's feeds. The main feed goes through refresh's own source choice (pickFeedSource: usable zips
 * only, an ended source gives way to a current one); a supplemental is read the way refresh loads it.
 */
export async function checkCandidate(
  candidate: ExpiryCandidate,
  download: (url: string) => Promise<Buffer>,
  now: Date = new Date(),
): Promise<CheckResult> {
  const expiryToday = agencyTodayYmd({ timezone: candidate.timezone }, now);
  const feeds: PeekedFeed[] = [];
  for (const feed of candidate.feeds) {
    if (feed.kind === 'main') {
      const picked = await pickFeedSource(feed.candidates, { download, expiryToday, log: () => {} });
      feeds.push({
        ...feed,
        url: picked.selectedCandidate?.url ?? null,
        peeked: picked.peekedExpiry,
        ...(picked.selectedCandidate ? {} : { error: picked.firstCandidateError?.message ?? 'no usable source' }),
      });
      continue;
    }
    const url = feed.candidates[0].url;
    try {
      const buf = await download(url);
      if (!isZipBuffer(buf)) throw new Error(`not a zip file (${buf.length} bytes)`);
      feeds.push({ ...feed, url, peeked: (await peekFeedInfo(buf)).feedExpiry });
    } catch (e) {
      feeds.push({ ...feed, url: null, peeked: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { slug: candidate.slug, reason: candidate.reason, newer: feeds.some(f => feedIsNewer(f.peeked, f.recorded)), feeds };
}
