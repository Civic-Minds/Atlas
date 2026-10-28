import { getNowPeriodForTimezone } from '../components/Interval/FilterChips';
import { PERIOD_KEYS, type TimePeriod } from '../hooks/useIntervalStats';
import { type HistoryView } from './historyYearMap';

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
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const h = sp.get('h') || sp.get('headway') || sp.get('max');
  let maxHeadway = Infinity;
  if (h && h !== 'all' && h !== 'inf' && h !== 'Infinity') {
    const n = Number(h);
    if (Number.isFinite(n) && n > 0) maxHeadway = n;
  }
  const p = sp.get('p') || sp.get('period');
  const period: TimePeriod = p && (PERIOD_KEYS as readonly string[]).includes(p) ? (p as TimePeriod) : historyDefaultPeriod(now);
  return { period, maxHeadway };
}

export function encodeHistoryView(view: HistoryView): { h: string; p: string } {
  return {
    h: Number.isFinite(view.maxHeadway) ? String(view.maxHeadway) : 'all',
    p: view.period,
  };
}
