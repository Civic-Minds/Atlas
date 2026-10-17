import type { DayType } from '../../shared/dayTypes';
import { PERIOD_LABELS, type TimePeriod } from '../hooks/useIntervalStats';
import { describeDayAndPeriod } from './mapExportDetails';
import { headwayAbout, headwayOrBetter } from './headwayText';
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

/** "every 10 min or better", or "all routes" when there is no limit. */
export function frequencyWords(maxHeadway: number): string {
  return maxHeadway === Infinity ? 'all routes' : headwayOrBetter(maxHeadway);
}

/** Everything a side shows, for its map label: "Weekday late · every 10 min or better". */
export function compareSideHeading(side: CompareSide): string {
  const title = compareSideLabel(side);
  return `${title.charAt(0).toUpperCase()}${title.slice(1)} · ${frequencyWords(side.maxHeadway)}`;
}

/**
 * Where the routes this side draws are missing on the other side, for "2 not on Saturday",
 * "2 not during midday" or "2 not at every 15 min". When more than one setting differs, naming
 * one of them would be misleading, so it names the other map instead.
 */
export function compareOtherPhrase(self: CompareSide, other: CompareSide, otherLabel: 'A' | 'B'): string {
  const dayDiffers = self.day !== other.day;
  const periodDiffers = self.period !== other.period;
  const headwayDiffers = self.maxHeadway !== other.maxHeadway;
  const differing = Number(dayDiffers) + Number(periodDiffers) + Number(headwayDiffers);
  if (differing !== 1) return `on map ${otherLabel}`;
  if (dayDiffers) return `on ${other.day}`;
  if (periodDiffers) {
    return other.period === 'all'
      ? 'all day'
      : `during ${PERIOD_LABELS[other.period].replace(/\b(Peak|Midday|Evening|Late|Overnight)\b/g, w => w.toLowerCase())}`;
  }
  return other.maxHeadway === Infinity ? `on map ${otherLabel}` : `at ${headwayOrBetter(other.maxHeadway)}`;
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
 * - Same day and time on both sides: the route's frequency once ("About every 16 min"), then which
 *   maps draw it ("On map B (every 20 min or better) · not on map A (every 10 min or better)").
 * - Day or time differ: one line per side with that side's own frequency
 *   ("A · Weekday midday: about every 16 min, on map").
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
