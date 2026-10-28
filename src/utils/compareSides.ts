import type { DayType } from '../../shared/dayTypes';
import type { TimePeriod } from '../hooks/useIntervalStats';
import { describeDayAndPeriod } from './mapExportDetails';
import { headwayAbout, headwayFilterLabel } from './headwayText';
import { NO_REGULAR_SERVICE_LABEL } from './effectiveHeadway';

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
  if (row.headway == null) return NO_REGULAR_SERVICE_LABEL;
  return headwayAbout(row.headway);
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The route card's compare section in plain words.
 * - Same day and time on both sides: the route's frequency once ("Every 16 min"), then which
 *   maps draw it ("On map B (≤20 min) · not on map A (≤10 min)").
 * - Day or time differ: one line per side with that side's own frequency
 *   ("A · Weekday midday: every 16 min, on map").
 */
export function compareCardSummary(rows: readonly CompareRowFacts[]): { headline: string | null; lines: string[] } {
  if (rows.length !== 2) return { headline: null, lines: [] };
  const [a, b] = rows;
  const sameTime = a.settings.day === b.settings.day && a.settings.period === b.settings.period;
  if (sameTime) {
    const ordered = [...rows].sort((x, y) => Number(y.passes) - Number(x.passes));
    const line = ordered
      .map(row => `${row.passes ? 'on' : 'not on'} map ${row.label} (${frequencyWords(row.settings.maxHeadway)})`)
      .join(' · ');
    return { headline: capitalize(routeFrequencyWords(a)), lines: [capitalize(line)] };
  }
  const frequencyDiffers = a.settings.maxHeadway !== b.settings.maxHeadway;
  const lines = rows.map(row => {
    const title = capitalize(compareSideLabel(row.settings)) + (frequencyDiffers ? ` · ${frequencyWords(row.settings.maxHeadway)}` : '');
    return `${row.label} · ${title}: ${routeFrequencyWords(row)}, ${row.passes ? 'on map' : 'not on map'}`;
  });
  return { headline: null, lines };
}

/** Longest side value kept whole on one line ("every 120 min, not on map"). */
const COMPARE_VALUE_NOWRAP_MAX = 26;

/**
 * A side's line wraps between its title and its value, never inside a short value, so "on map" never sits alone on a
 * line (CIV-844): "A · Weekday PM peak:" then "every 3 min, on map". A long value keeps only its last word with
 * "on map". Same words, non-breaking spaces only.
 */
export function compareLineNoOrphan(line: string): string {
  const at = line.lastIndexOf(': ');
  if (at < 0) return line;
  const value = line.slice(at + 2);
  const kept = value.length <= COMPARE_VALUE_NOWRAP_MAX
    ? value.replace(/ /g, '\u00A0')
    : value.replace(/ (\S+, (?:not )?on) (map)$/, (_m, last: string, map: string) => `\u00A0${last.replace(/ /g, '\u00A0')}\u00A0${map}`);
  return `${line.slice(0, at + 2)}${kept}`;
}

/**
 * Whether a map's drawn routes can be counted yet (#1075). Until its route layers exist and every
 * tile has arrived the map draws nothing or only some routes, so a count then would read "0 routes"
 * for a map that is only loading. A loaded map with nothing on it still counts as 0.
 */
export function canCountRenderedRoutes(map: { loaded(): boolean }, routeLayerCount: number): boolean {
  return routeLayerCount > 0 && map.loaded();
}
