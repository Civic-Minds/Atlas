import { PERIOD_KEYS, type TimePeriod } from '../hooks/useIntervalStats';
import { HISTORY_VIEW_ALL, type HistoryView } from './historyYearMap';

/**
 * History's Frequency and Time in the link, in the map's own params and format (h, p), so a map link
 * and a History link read the same (CIV-392, CIV-389). h is "all" or minutes; p is a period key, left
 * out for "all". History always writes h, because the map reads a missing h as its 60 default while
 * History's default is All. A link without them (every older History link) opens on All / All day.
 */
export function parseHistoryView(search: string | URLSearchParams): HistoryView {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const h = sp.get('h') || sp.get('headway') || sp.get('max');
  let maxHeadway = HISTORY_VIEW_ALL.maxHeadway;
  if (h && h !== 'all' && h !== 'inf' && h !== 'Infinity') {
    const n = Number(h);
    if (Number.isFinite(n) && n > 0) maxHeadway = n;
  }
  const p = sp.get('p') || sp.get('period');
  const period: TimePeriod = p && (p === 'all' || (PERIOD_KEYS as readonly string[]).includes(p)) ? (p as TimePeriod) : 'all';
  return { period, maxHeadway };
}

export function encodeHistoryView(view: HistoryView): { h: string; p: string | null } {
  return {
    h: Number.isFinite(view.maxHeadway) ? String(view.maxHeadway) : 'all',
    p: view.period === 'all' ? null : view.period,
  };
}
