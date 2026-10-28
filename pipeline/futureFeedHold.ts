/**
 * A new timetable that has not started yet waits while the current one still runs (#1144).
 *
 * A feed URL can start serving next season's timetable before it begins (TANK served its
 * 2026-11-07 winter feed from 2026-10-22; TTC its 2026-11-01 board). Processing it then puts
 * service that doesn't run yet on the map. Refresh holds such a feed, keeping the live artifact,
 * until its first service date; rebuild picks the archived zip in service today; and the release
 * gate refuses a future start while the live data is still in service. Pure, so it is tested
 * without R2.
 */
import type { PeekedArchive } from './archiveSelection.js';
import { isYmd } from '../shared/feedAvailability.js';

/**
 * The date a new feed is held until, or null to process it now. Held when its first service date
 * is after today and the live feed still runs today. An expired live feed is not held onto: the
 * next timetable is closer to the truth than a feed that has ended.
 */
export function futureFeedHoldUntil(opts: {
  feedStart: string | null | undefined;
  todayYmd: string;
  /** The expiry of the feed the live data was built from (lastFeedExpiry). */
  liveFeedExpiry: string | null | undefined;
}): string | null {
  const { feedStart, todayYmd, liveFeedExpiry } = opts;
  if (!isYmd(feedStart) || feedStart <= todayYmd) return null;
  if (!isYmd(liveFeedExpiry) || liveFeedExpiry < todayYmd) return null;
  return feedStart;
}

/** The log line and summary for a held feed. */
export function heldFeedSummary(until: string): string {
  return `held (timetable starts ${until}; the current one stays live until then)`;
}

/** Agencies whose held timetable has started (each in its own local date): the ones to refresh today. */
export function heldFeedsDue<A extends { slug: string; heldFeedStart?: string | null }>(
  agencies: readonly A[],
  todayYmd: string | ((agency: A) => string),
): string[] {
  const today = (a: A) => (typeof todayYmd === 'string' ? todayYmd : todayYmd(a));
  return agencies
    .filter(a => isYmd(a.heldFeedStart) && a.heldFeedStart <= today(a))
    .map(a => a.slug)
    .sort();
}

/**
 * Rebuild's archive pick, checked against start dates: when the picked zip has not started and the
 * live feed still runs, take the archived zip in service today instead (started, not ended; the one
 * running latest, then the newest upload). Null keeps the pick; a reason string refuses the agency.
 */
export function startedArchiveInstead(opts: {
  pickedKey: string;
  peeked: PeekedArchive[];
  todayYmd: string;
  liveFeedExpiry: string | null | undefined;
}): { key: string; reason: string } | { refuse: string } | null {
  const picked = opts.peeked.find(p => p.obj.key === opts.pickedKey);
  const until = futureFeedHoldUntil({ feedStart: picked?.dates.feedStart, todayYmd: opts.todayYmd, liveFeedExpiry: opts.liveFeedExpiry });
  if (!until) return null;
  const inService = opts.peeked.filter(p => {
    const { feedStart, feedExpiry } = p.dates;
    return !!feedExpiry && feedExpiry >= opts.todayYmd && (!feedStart || feedStart <= opts.todayYmd);
  });
  if (inService.length === 0) {
    return { refuse: `newest archived zip ${opts.pickedKey} starts ${until}, and no archived zip is in service today` };
  }
  const latest = inService.map(p => p.dates.feedExpiry!).sort().at(-1)!;
  const top = inService.filter(p => p.dates.feedExpiry === latest)
    .sort((a, b) => (b.obj.lastModified?.getTime() ?? 0) - (a.obj.lastModified?.getTime() ?? 0));
  return { key: top[0].obj.key, reason: `in service today to ${latest}; ${opts.pickedKey} starts ${until} (#1144)` };
}
