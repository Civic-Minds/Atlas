import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { headwayPeriodShape } from '../../shared/headwayText';
import { buildDirectionGroups } from './routeCardDirectionGroups';
import { buildRouteCardModel } from './routeCardRows';

/** What the route card shows for a period, as the lists read it (one card per route-day-period, cached). */
interface CardReading {
  /** The lowest number the card shows (its Shared stretch rows and destination rows); undefined when it shows none. */
  lowest: number | undefined;
  /** #1311: the card has rows, and none shows a number or words: each reads "Runs irregularly in this period". */
  noNumber: boolean;
  /** #1311: each row's direction filter value, its number and its words, for the list's gap words. */
  rows: Array<{ direction: number | null | undefined; headway: number | undefined; label: string | undefined }>;
}

/**
 * #1231: the lowest number the route card shows for the period (its Shared stretch rows and destination rows), so a list
 * range starts where the card does (TTC 102 midday: the card's 20 and 30, not the list's old 5–30). Undefined when the card
 * shows no number.
 */
export function routeCardLowestHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | undefined {
  return cardReading(features, period)?.lowest;
}

/** #1311: the route card has rows for the period and none of them shows a number or words. */
export function routeCardShowsNoNumber(features: readonly ShapeProperties[], period: TimePeriod): boolean {
  return cardReading(features, period)?.noNumber ?? false;
}

/**
 * #1311: the card's words where the route's value is one gap inside steady service: every row of a direction whose filter
 * value is the route's reads "every 15 min, with one 32 min gap" (OC Transpo 6 weekday midday, the list's "every 32").
 * Undefined when no such row has the words, or the rows disagree.
 */
export function routeCardGapWords(features: readonly ShapeProperties[], period: TimePeriod, value: number): { every: number; gap: number } | undefined {
  if (period === 'all') return undefined;
  const rows = (cardReading(features, period)?.rows ?? []).filter(row => row.direction === value);
  const gaps = rows.filter(row => row.headway != null && row.headway < value && row.label === headwayPeriodShape({ every: row.headway, gap: value }));
  if (gaps.length === 0) return undefined;
  // Another row of the same direction showing the value itself, or other words, disagrees.
  if (rows.some(row => !gaps.includes(row) && row.headway === value)) return undefined;
  const everies = new Set(gaps.map(row => row.headway!));
  return everies.size === 1 ? { every: [...everies][0], gap: value } : undefined;
}

function cardReading(features: readonly ShapeProperties[], period: TimePeriod): CardReading | undefined {
  // Lists call this once per route feature (the search suggestions) and per period: one card per route-day-period, keyed
  // by the route's first and last feature objects (the layer's own, so a new layer is a new key).
  const first = features[0];
  if (!first) return undefined;
  const key = `${period}|${features.length}`;
  const byLast = readingCache.get(first)?.get(features[features.length - 1]);
  const cached = byLast?.get(key);
  if (cached) return cached;
  const reading = readCard(features, period);
  let byFirst = readingCache.get(first);
  if (!byFirst) { byFirst = new WeakMap(); readingCache.set(first, byFirst); }
  let entry = byFirst.get(features[features.length - 1]);
  if (!entry) { entry = new Map(); byFirst.set(features[features.length - 1], entry); }
  entry.set(key, reading);
  return reading;
}

const readingCache = new WeakMap<ShapeProperties, WeakMap<ShapeProperties, Map<string, CardReading>>>();

function readCard(features: readonly ShapeProperties[], period: TimePeriod): CardReading {
  const directions = [...features];
  const route = { routeShortName: directions[0]?.routeShortName ?? null, routeLongName: directions[0]?.routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  let lowest: number | undefined;
  let rowCount = 0;
  let anyShown = false;
  const rows: CardReading['rows'] = [];
  for (const group of model.groups) {
    if (group.shared) anyShown = true;
    for (const value of [group.shared?.headway, ...group.rows.map(row => row.display(null).value.headway)]) {
      if (typeof value === 'number' && (lowest === undefined || value < lowest)) lowest = value;
    }
    for (const row of group.rows) {
      if (row.night) continue;
      const value = row.display(null).value;
      rowCount += 1;
      if (value.headway != null || value.edgeText != null || value.headwayLabel != null) anyShown = true;
      const direction = period !== 'all' ? row.feature.directionFilterHeadwayByPeriod?.[period] : undefined;
      rows.push({ direction, headway: value.headway, label: value.headwayLabel });
    }
  }
  return { lowest, noNumber: rowCount > 0 && !anyShown, rows };
}
