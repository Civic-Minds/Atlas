/**
 * Live's status pill (CIV-2084, Ryan picked 1): how fresh each agency's positions are. Live while the newest position is
 * within LIVE_STALE_PACES of the agency's pace, delayed when older, unavailable with no positions or a refused feed.
 */
import { LIVE_STALE_PACES, livePaceSec } from './rules/live.js';

export type LiveStatus = 'live' | 'delayed' | 'unavailable';

/** One agency's feed as Live last polled it: its newest vehicle report (unix seconds) and whether the poll failed. */
export interface LiveAgencyFeed {
  slug: string;
  name: string;
  newestSec: number | null;
  failed: boolean;
}

export function liveAgencyStatus(feed: Pick<LiveAgencyFeed, 'slug' | 'newestSec' | 'failed'>, nowSec: number): LiveStatus {
  if (feed.failed || feed.newestSec == null) return 'unavailable';
  return nowSec - feed.newestSec <= LIVE_STALE_PACES * livePaceSec(feed.slug) ? 'live' : 'delayed';
}

const RANK: Record<LiveStatus, number> = { live: 0, delayed: 1, unavailable: 2 };

/** The pill's one state for the agencies in view: the worst of theirs. Null with none in view. */
export function worstLiveStatus(statuses: readonly LiveStatus[]): LiveStatus | null {
  return statuses.reduce<LiveStatus | null>((w, s) => (w == null || RANK[s] > RANK[w] ? s : w), null);
}

/** The newest vehicle report among these (unix seconds), or null with none. */
export function newestReportSec(vehicles: readonly { tsEpoch?: number | null }[]): number | null {
  let newest: number | null = null;
  for (const v of vehicles) if (v.tsEpoch != null && (newest == null || v.tsEpoch > newest)) newest = v.tsEpoch;
  return newest;
}
