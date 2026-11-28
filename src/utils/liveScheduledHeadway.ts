import type { DayType, TimePeriod } from '../hooks/useIntervalStats';
import { buildCurrentRoute } from './routeCardRoute';
import { buildDirectionGroups, routeDirectionOverrides, type RouteDirectionOverrides } from './routeCardDirectionGroups';
import { routeKeyForShortName } from './routeKey';
import { periodKeyForHour } from '../../shared/config';
import { getNowDay } from '../../shared/dayTypes';
import { buildRouteCardModel, cardGroupLines, type RouteCardModel } from './routeCardRows';

/** The main map's route card model for a route now, the one source Live reads its scheduled figures from (#1234, CIV-2045). */
function liveCardModel(fc: GeoJSON.FeatureCollection, routeKey: string, day: DayType, period: TimePeriod, overrides: RouteDirectionOverrides): RouteCardModel | null {
  const slug = routeKey.slice(0, routeKey.indexOf('::'));
  const route = buildCurrentRoute(routeKey, { [slug]: fc }, day, period);
  if (!route) return null;
  return buildRouteCardModel({
    directions: route.directions,
    routeShortName: route.routeShortName,
    routeLongName: route.routeLongName,
    directionGroups: buildDirectionGroups(route, period, overrides.directionLabels, overrides.directionHeadsigns),
    agencyFeatures: fc.features,
    period,
    maxHeadway: Infinity,
    nightView: false,
    stableColors: false,
    hideSpan: false,
  });
}

/**
 * The card's direction for Live's picked one (#1664): by its name first, since Live's direction numbers come from the
 * route's Live analysis and can be the other way round from the schedule's (TTC 501: Live's 0 is westbound, the
 * schedule's 0 eastbound); by number when the name matches no direction; the first direction with neither.
 */
function cardGroupIndex(model: RouteCardModel, directionId: number | null, directionLabel: string | null): number {
  const norm = (t: string | undefined | null) => (t ?? '').trim().toLowerCase();
  const byLabel = directionLabel ? model.groups.findIndex(g => norm(g.boundLabel) === norm(directionLabel)) : -1;
  if (byLabel >= 0) return byLabel;
  return directionId == null ? 0 : model.groups.findIndex(g => g.dirId === directionId);
}

/**
 * Live's Scheduled rows (CIV-2045, Ryan: "1"; "510 Spadina ... Scheduled every 5–10 min ... doesnt reflect that half them
 * turn back at queens qya"): the route card's own lines for the picked direction (its shared stretch, each branch and
 * short turn), read with the card's one reading (cardGroupLines), never a range of its own across stops. With no
 * direction picked, the first direction the card shows. Empty when the card shows nothing.
 */
export interface LiveScheduledRow {
  /** Stable within the card: "shared", or the card row's own id. */
  key: string;
  label: string;
  value: string;
  /** The row's destination (its headsign), to tie it to the Live pattern ending there (CIV-2047); null for the shared stretch. */
  headsign: string | null;
  /** The row's own scheduled gap in minutes, what its gaps are judged against (CIV-2047); null when it gives no number. */
  headwayMin: number | null;
}

export function liveScheduledRows(
  fc: GeoJSON.FeatureCollection,
  routeKey: string,
  day: DayType,
  period: TimePeriod,
  directionId: number | null,
  overrides: RouteDirectionOverrides = {},
  /** The direction's name as Live shows it ("Westbound"): it picks the card's direction first (#1664). */
  directionLabel: string | null = null,
): LiveScheduledRow[] {
  const model = liveCardModel(fc, routeKey, day, period, overrides);
  if (!model) return [];
  const gi = cardGroupIndex(model, directionId, directionLabel);
  const group = model.groups[gi];
  if (!group) return [];
  const lines = cardGroupLines(group, gi, model.limitedWord, false);
  const shared = lines.filter(l => l.shared);
  const rest = lines.filter(l => !l.shared);
  // The card's lines come shared first, then one per row in order, then span rows.
  return [
    ...shared.map(l => ({ key: 'shared', label: l.label, value: l.value, headsign: null, headwayMin: group.shared?.headway ?? null })),
    ...rest.map((l, i) => {
      const row = group.rows[i];
      const v = row && !row.night ? row.display(null).value : null;
      return { key: row?.id ?? `span-${i}`, label: l.label, value: l.value, headsign: row?.feature.headsign ?? null, headwayMin: v && !v.isLimited ? v.headway ?? null : null };
    }),
  ];
}

/**
 * Live's "scheduled every N" (#1234): the route card's own number, read from the card model, so Live never says
 * every 16 where the card says every 8 (TTC 29 northbound, both branches pooled on the shared stretch). A direction's
 * number is its Shared stretch / Combined row when the card shows one, else its most frequent row. With a direction
 * picked, that direction's; else the most frequent direction's. Null when the card shows no number.
 */
export function liveScheduledHeadway(
  fc: GeoJSON.FeatureCollection,
  routeKey: string,
  day: DayType,
  period: TimePeriod,
  directionId: number | null,
  overrides: RouteDirectionOverrides = {},
  /** The direction's name as Live shows it: picks the card's direction first (#1664). */
  directionLabel: string | null = null,
): number | null {
  const model = liveCardModel(fc, routeKey, day, period, overrides);
  if (!model) return null;
  const picked = directionId != null || directionLabel ? cardGroupIndex(model, directionId, directionLabel) : -1;
  let best: number | null = null;
  for (const [gi, group] of model.groups.entries()) {
    if (picked >= 0 ? gi !== picked : directionId != null) continue;
    const rowValues = group.rows
      .map(row => row.display(null).value)
      .filter(value => !value.isLimited && value.headway != null)
      .map(value => value.headway as number);
    const value = group.shared?.headway ?? (rowValues.length > 0 ? Math.min(...rowValues) : null);
    if (value != null && (best == null || value < best)) best = value;
  }
  return best;
}

/**
 * The Live route card's Scheduled lines right now (CIV-2045) for a route by its short name: today's day type and the
 * period of the clock hour, the agency's direction overrides, the picked direction by its number and name. Null where
 * the route has no card or the hour has no period. One call for main Live and Studio's Live route panel (CIV-2021).
 */
export function liveScheduledRowsNow(
  fc: GeoJSON.FeatureCollection | undefined,
  agencies: Parameters<typeof routeDirectionOverrides>[0],
  slug: string,
  routeShortName: string,
  counted: { directionId: number; label: string } | null,
): LiveScheduledRow[] | null {
  const routeKey = fc ? routeKeyForShortName(slug, fc.features, routeShortName, getNowDay()) : null;
  if (!fc || !routeKey) return null;
  const period = periodKeyForHour(new Date().getHours());
  if (!period) return null;
  return liveScheduledRows(fc, routeKey, getNowDay(), period, counted?.directionId ?? null, routeDirectionOverrides(agencies, slug, routeShortName), counted?.label ?? null);
}

/** The main map's route card model for a route now (today, the clock hour's period): what Studio's Live panel draws its rows from, as the map's card does. */
export function liveCardModelNow(
  fc: GeoJSON.FeatureCollection | undefined,
  agencies: Parameters<typeof routeDirectionOverrides>[0],
  slug: string,
  routeShortName: string,
): RouteCardModel | null {
  const routeKey = fc ? routeKeyForShortName(slug, fc.features, routeShortName, getNowDay()) : null;
  const period = periodKeyForHour(new Date().getHours());
  if (!fc || !routeKey || !period) return null;
  return liveCardModel(fc, routeKey, getNowDay(), period, routeDirectionOverrides(agencies, slug, routeShortName));
}
