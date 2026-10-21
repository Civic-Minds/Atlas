import type { HeadwayByPeriod } from './config.js';

/**
 * History v2 snapshot data (additive; old snapshots carry none of it).
 *
 * The weekday headline is the route's all-day value the map uses (routeAllDayHeadway:
 * worst direction, main-stretch median), never the fastest pattern. Anything the feed
 * cannot prove is left out: a missing key means unknown, never zero.
 */

/** Below this many minutes a headline is stored with the `fast` flag (stored only; never hidden). */
export const HISTORY_FAST_BELOW_MIN = 2;
/** Above this many minutes a headline is stored with the `slow` flag (stored only; never hidden). */
export const HISTORY_SLOW_ABOVE_MIN = 300;

export type HistoryFlag = 'fast' | 'slow' | 'limited';

/** A weekend day's headline: a number, limited (no all-day value), or positively no service. */
export type HistoryDayValue = { h: number } | { lim: true } | { none: true };

/** The representative weekday value: `h` (minutes), or `lim` when the route has no all-day value. Neither = blank. */
export interface HistoryRep {
  h?: number;
  lim?: true;
  p?: HeadwayByPeriod;
}

export interface HistorySnapshotV2 {
  /** The real service day the processor read (same auto-detected reference date as the map), YYYYMMDD. */
  refDate: string;
  /** The route key (historyRouteKey). */
  key: string;
  rep: HistoryRep;
  sat?: HistoryDayValue;
  sun?: HistoryDayValue;
  flag?: HistoryFlag;
}

/** One route inside an immutable sidecar object history-v2/{slug}/{periodKey}.json. */
export interface HistoryV2SidecarRoute {
  name?: string;
  rep: HistoryRep;
  sat?: HistoryDayValue;
  sun?: HistoryDayValue;
  flag?: HistoryFlag;
}

export interface HistoryV2Sidecar {
  version: 2;
  slug: string;
  periodKey: string;
  refDate: string;
  routes: Record<string, HistoryV2SidecarRoute>;
  /**
   * Routes in `routes` that came from a supplemental feed (e.g. rail), by feed url. Present only
   * when a supplemental feed was part of this snapshot; its absence means bus feed only.
   */
  supplementalRoutes?: Record<string, string[]>;
}

export function historyFlagFor(rep: HistoryRep): HistoryFlag | undefined {
  if (rep.lim) return 'limited';
  if (rep.h == null) return undefined;
  if (rep.h < HISTORY_FAST_BELOW_MIN) return 'fast';
  if (rep.h > HISTORY_SLOW_ABOVE_MIN) return 'slow';
  return undefined;
}

/** YYYYMMDD -> year, or null when it is not a real date string. */
export function yearOfRefDate(refDate: string | null | undefined): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(refDate ?? '');
  return match ? Number(match[1]) : null;
}
