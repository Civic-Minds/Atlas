import { getNowPeriodForTimezone } from '../components/Interval/FilterChips';
import { type TimePeriod } from '../hooks/useIntervalStats';
import { type HistoryView } from './historyYearMap';
import { HISTORY_VIEW_URL, linkUpdate, readLink } from './urlSchema';

/** The period History opens on (CIV-1097): the current one, from the same helper the map opens on. */
export function historyDefaultPeriod(now: Date = new Date()): TimePeriod {
  return getNowPeriodForTimezone(null, now);
}

/** History's Frequency (All) and Time (the default period) when nothing else says otherwise. */
export function historyDefaultView(now: Date = new Date()): HistoryView {
  return { period: historyDefaultPeriod(now), maxHeadway: Infinity };
}

/**
 * History's Frequency and Time in the link, in the map's own params and format (h, p), so a map link
 * and a History link read the same (CIV-392, CIV-389). h is "all" or minutes; p is a period key. Both are
 * always written: the map reads a missing h as its 60 default while History's default is All, and a
 * missing p as the current period. A link without p (every older History link, or one saying "all", the
 * all-day view History no longer has) opens on the default period (CIV-1097).
 */
export function parseHistoryView(search: string | URLSearchParams, now: Date = new Date()): HistoryView {
  const link = readLink(search, HISTORY_VIEW_URL);
  return { period: link.period ?? historyDefaultPeriod(now), maxHeadway: link.headway ?? Infinity };
}

export function encodeHistoryView(view: HistoryView): { h: string; p: string } {
  return linkUpdate(HISTORY_VIEW_URL, { headway: view.maxHeadway, period: view.period }) as { h: string; p: string };
}
