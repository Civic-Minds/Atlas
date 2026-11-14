import { getNowPeriodForTimezone } from '../components/Interval/FilterChips';
import { type TimePeriod } from '../hooks/useIntervalStats';
import { type HistoryView } from './historyYearMap';
import { FEATURES } from '../../shared/config';
import { HISTORY_VIEW_URL, linkUpdate, readLink } from './urlSchema';
import { openingDay } from './openingDay';

/** The period History opens on (CIV-1097): the current one, from the same helper the map opens on. */
export function historyDefaultPeriod(now: Date = new Date()): TimePeriod {
  return getNowPeriodForTimezone(null, now);
}

/**
 * History's Frequency (All), Time (the default period) and day when nothing else says otherwise. CIV-1433: with the
 * day picker on, the day is the map's own opening day (openingDay: saved day, else today); with it off, Weekday.
 */
export function historyDefaultView(now: Date = new Date(), dayPicker: boolean = FEATURES.historyDayPicker): HistoryView {
  return { period: historyDefaultPeriod(now), maxHeadway: Infinity, day: dayPicker ? openingDay(null) : 'Weekday' };
}

/**
 * History's Frequency and Time in the link, in the map's own params and format (h, p), so a map link
 * and a History link read the same (CIV-392, CIV-389). h is "all" or minutes; p is a period key. Both are
 * always written: the map reads a missing h as its 60 default while History's default is All, and a
 * missing p as the current period. A link without p (every older History link, or one saying "all", the
 * all-day view History no longer has) opens on the default period (CIV-1097).
 * CIV-1425: with the day picker on, History's day is its own `hday`, always written like the map's `day`; a link
 * without it opens on the map's opening day (CIV-1433, openingDay). With it off, `hday` is neither read nor written
 * and History stays on Weekday.
 */
export function parseHistoryView(search: string | URLSearchParams, now: Date = new Date(), dayPicker: boolean = FEATURES.historyDayPicker): HistoryView {
  const link = readLink(search, HISTORY_VIEW_URL);
  return { period: link.period ?? historyDefaultPeriod(now), maxHeadway: link.headway ?? Infinity, day: dayPicker ? openingDay(link.day) : 'Weekday' };
}

export function encodeHistoryView(view: HistoryView, dayPicker: boolean = FEATURES.historyDayPicker): { h: string; p: string; hday?: string | null } {
  return dayPicker
    ? linkUpdate(HISTORY_VIEW_URL, { headway: view.maxHeadway, period: view.period, day: view.day }) as { h: string; p: string; hday: string | null }
    : linkUpdate(HISTORY_VIEW_URL, { headway: view.maxHeadway, period: view.period }) as { h: string; p: string };
}
