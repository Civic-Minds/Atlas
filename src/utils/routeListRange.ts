import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { buildDirectionGroups } from './routeCardDirectionGroups';
import { buildRouteCardModel } from './routeCardRows';
import { headwayRangeShown } from './headwayText';
import { routeCardDirectionOrder } from './routeCardRoute';

/** The lowest and highest numbers the route card shows for a period. */
export interface RouteCardRange {
  low: number;
  high: number;
  /** The slowest colour the card's rows draw (a row's dot can take its filter number, slower than its words: NYC B AM peak "every 9 min from 7:12 AM" is coloured for 72). */
  color: number;
  /**
   * CIV-1300 (#1311): the card's own words for its highest number, where the row says more than "every N" ("every 15 min,
   * with one 32 min gap"; "every 9 min from 7:12 AM"). Undefined when the row reads its plain number.
   */
  words?: string;
}

/**
 * #1231, CIV-1447: the lowest and highest numbers the route card shows for the period (its Shared stretch rows, its
 * destination rows, and both ends of a row's own range), so a list reads the card's range (Ryan: "lists must match the
 * card"). TTC 63 weekday AM peak: the card's "every 5–16" and "every 9" make the list "every 5–16"; Brampton 1: "every
 * 13–23" and "every 13–25" make "every 13–25". The card's stretch values included (CIV-995 Q3, Ryan 2026-11-13: lists
 * follow the card; History's stored low ends read this too). Undefined when the card shows no number.
 */
export function routeCardRange(features: readonly ShapeProperties[], period: TimePeriod): RouteCardRange | undefined {
  // Lists call this once per route feature (the search suggestions) and per period: one card per route-day-period, keyed
  // by the route's first and last feature objects (the layer's own, so a new layer is a new key).
  const first = features[0];
  if (!first) return undefined;
  const key = `${period}|${features.length}`;
  const byLast = rangeCache.get(first)?.get(features[features.length - 1]);
  if (byLast?.has(key)) return byLast.get(key) ?? undefined;
  const range = cardRange(features, period);
  let byFirst = rangeCache.get(first);
  if (!byFirst) { byFirst = new WeakMap(); rangeCache.set(first, byFirst); }
  let entry = byFirst.get(features[features.length - 1]);
  if (!entry) { entry = new Map(); byFirst.set(features[features.length - 1], entry); }
  entry.set(key, range ?? null);
  return range;
}

/** #1231: the lowest number the route card shows (routeCardRange's low end). */
export function routeCardLowestHeadway(features: readonly ShapeProperties[], period: TimePeriod): number | undefined {
  return routeCardRange(features, period)?.low;
}

const rangeCache = new WeakMap<ShapeProperties, WeakMap<ShapeProperties, Map<string, RouteCardRange | null>>>();

function cardRange(features: readonly ShapeProperties[], period: TimePeriod): RouteCardRange | undefined {
  // The card's own order (buildCurrentRoute): its rows, and so its numbers, depend on it.
  const directions = routeCardDirectionOrder(features, period);
  const route = { routeShortName: directions[0]?.routeShortName ?? null, routeLongName: directions[0]?.routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  const read = (bare: boolean) => {
    const shown: number[] = [];
    let color = 0;
    const worded: Array<{ h: number; words: string }> = [];
    for (const group of model.groups) {
      if (typeof group.shared?.headway === 'number') shown.push(group.shared.headway);
      for (const row of group.rows) {
        const v = row.display(null).value;
        // A row with no number (limited, irregular) shows none; a row reading a range ("every 15–54") shows both ends.
        if (v.isLimited || v.headway == null) continue;
        // #1684: a row whose words name a time reads their number ("every 16 min from 6:39 AM" is 16), not the period's
        // typical gap under them (MBTA 65 weekday AM peak: the list read "every 8–14" beside that row). #1771: where the
        // list can't show the words and they name a change partway ("every 4 min until 9:17 AM, then every 6 min"), the
        // number alone is the slower of the two, as a list row is the route's slowest showing, not the first part's (STM 1
        // weekday midday read "every 4" for a period that runs every 6 from 9:17 AM).
        const h = v.edgeText != null && v.shownHeadway != null ? (bare && v.shownThen != null ? Math.max(v.shownHeadway, v.shownThen) : v.shownHeadway) : v.headway;
        shown.push(h);
        color = Math.max(color, h, v.colorHeadway ?? 0);
        const range = v.trunkHeadway != null && headwayRangeShown(v.trunkHeadway, h);
        if (range) shown.push(v.trunkHeadway!);
        else if (v.headwayLabel) worded.push({ h, words: v.headwayLabel });
      }
    }
    return { shown, color, worded };
  };
  const worded = read(false);
  if (!worded.shown.length) return undefined;
  // Rows at that number saying different things leave the list on the number.
  const said = new Set(worded.worded.filter(w => w.h === Math.max(...worded.shown)).map(w => w.words));
  const words = said.size === 1 ? [...said][0] : undefined;
  const { shown, color } = words ? worded : read(true);
  const high = Math.max(...shown);
  return { low: Math.min(...shown), high, color: Math.max(color, high), ...(words ? { words } : {}) };
}

/**
 * CIV-2232 follow-up (Ryan, 2026-11-24, "1": hide irregular routes "(unless the user turns off irregular routes)"): the
 * lines whose route card row reads "Runs irregularly in this period" for the period, read from the card's own model, so the
 * map's hide-irregular setting and the card read one value. A line that isn't a card row of its own is never in it.
 */
export function cardIrregularLines(features: readonly ShapeProperties[], period: TimePeriod): Set<ShapeProperties> {
  const out = new Set<ShapeProperties>();
  if (period === 'all' || features.length === 0) return out;
  const directions = routeCardDirectionOrder(features, period);
  const route = { routeShortName: directions[0]?.routeShortName ?? null, routeLongName: directions[0]?.routeLongName ?? null, directions };
  const model = buildRouteCardModel({
    ...route, directionGroups: buildDirectionGroups(route, period), agencyFeatures: undefined,
    period, maxHeadway: Infinity, nightView: false, stableColors: false, hideSpan: false,
  });
  for (const group of model.groups) for (const row of group.rows) if (row.display(null).value.rowNoRegular) out.add(row.feature);
  return out;
}
