import type { DayType } from '../../shared/dayTypes';
import type { TimePeriod } from '../hooks/useIntervalStats';
import { describeDayAndPeriod } from './mapExportDetails';
import { headwayAbout, headwayFilterLabel } from './headwayText';
import { NO_REGULAR_SERVICE_SHORT_LABEL } from './effectiveHeadway';

/** One side of compare mode: its own day, time and frequency threshold (CIV-19). */
export interface CompareSide {
  day: DayType;
  period: TimePeriod;
  /** Frequency threshold in minutes; Infinity shows every route. */
  maxHeadway: number;
}

/**
 * Side B when compare starts: a copy of A on a different day. An exact copy would draw two
 * identical maps, so the day comparison stays the starting point; the frequency starts the same
 * as A's and can then be changed on B alone.
 */
export function defaultCompareSide(a: CompareSide): CompareSide {
  return { day: a.day === 'Saturday' ? 'Sunday' : 'Saturday', period: a.period, maxHeadway: a.maxHeadway };
}

/** "Saturday midday", "Weekday AM peak", "Sunday, all day". */
export function compareSideLabel(side: Pick<CompareSide, 'day' | 'period'>): string {
  return describeDayAndPeriod(side.day, side.period);
}

/** The side's frequency limit, worded like the pickers: "≤10 min", or "All" (#1011). */
export function frequencyWords(maxHeadway: number): string {
  return headwayFilterLabel(maxHeadway);
}

/** Everything a side shows, for its map label: "Weekday late · ≤10 min". */
export function compareSideHeading(side: CompareSide): string {
  const title = compareSideLabel(side);
  return `${title.charAt(0).toUpperCase()}${title.slice(1)} · ${frequencyWords(side.maxHeadway)}`;
}

/** One compare side of a route, as the route card needs it. */
export interface CompareRowFacts {
  label: 'A' | 'B';
  settings: CompareSide;
  /** Frequency the filter judges, in minutes; null when there is no regular frequency. */
  headway: number | null;
  passes: boolean;
  runs: boolean;
}

function routeFrequencyWords(row: CompareRowFacts): string {
  if (!row.runs) return 'no service';
  if (row.headway == null) return NO_REGULAR_SERVICE_SHORT_LABEL;
  return headwayAbout(row.headway);
}

/**
 * A compare card's one grey facts line under its title (CIV-844, Ryan): the side, that side's day and time, and the
 * route's frequency there, "A · Weekday PM peak · every 3 min". Each map's card shows its own side.
 */
export function compareCardFacts(row: CompareRowFacts): string {
  const title = compareSideLabel(row.settings);
  return `${row.label} · ${title.charAt(0).toUpperCase()}${title.slice(1)} · ${routeFrequencyWords(row)}`;
}

/**
 * Whether a map's drawn routes can be counted yet (#1075). Until its route layers exist and every
 * tile has arrived the map draws nothing or only some routes, so a count then would read "0 routes"
 * for a map that is only loading. A loaded map with nothing on it still counts as 0.
 */
export function canCountRenderedRoutes(map: { loaded(): boolean }, routeLayerCount: number): boolean {
  return routeLayerCount > 0 && map.loaded();
}
