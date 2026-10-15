/**
 * Shared stretches (CIV-82, #690).
 *
 * A feature's stop values read what serves each stop (process-core, #690): at every stop where
 * another pattern of the same route direction pools with the feature's own, the stop's
 * departures are the merged lists (pipeline/stopPools.ts decides who pools where). This module
 * records where that happened, as index ranges into each feature's stopOrder, so the map can
 * draw a failing route's passing shared stretch (the frequency overlay), the route card can name
 * the patterns it shares with, and the stop card can say the value is pooled.
 *
 * - sharedStretches (on each member feature): stopOrder index ranges where its own pattern
 *   pools with another, with the headsigns it shares them with.
 *
 * Rule (CIV-82): a route may show the stretches that themselves pass; it never makes the whole
 * route pass. Route-level values never read a pooled stop value.
 *
 * Which trips pool: only departures of trips whose headsign an eligible feature draws (regular or
 * time-limited LineString features of the same route_id, direction and day; not span, irregular,
 * partial-weekday, previous-night-tail or drop-off-only), and no stop time with pickup_type 1.
 * Two patterns share a stop only inside an aligned run of at least SHARED_STRETCH_MIN_STOPS stops
 * and SHARED_STRETCH_MIN_KM (a hub stop or a 2-3 stop overlap never pools), or at every common
 * stop when they are same-destination variants (stopPools.ts). Opposite-direction stops are
 * paired on read (shared/sharedStops.ts pairOppositeStop).
 */import type { GeoJsonFeature } from './geojson-types.js';
import { sharedStopGroupKey, type SharedStretch } from '../shared/sharedStops.js';
import { computeStopSharers } from './stopPools.js';

export const SHARED_STRETCH_MIN_STOPS = 5;
export const SHARED_STRETCH_MIN_KM = 1;

const DROP_OFF_ONLY = /drop[- ]?offs?\s+only/i;

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * p) / 2) ** 2
    + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(((b.lon - a.lon) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/**
 * Index ranges of `a` (inclusive) where consecutive stops of `a` are all served by `b`
 * in the same order. Order is required so two patterns that cross or run the opposite
 * way over a few stops are not treated as one stretch.
 */
export function alignedSharedRuns(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const bIndex = new Map<string, number>();
  b.forEach((stopId, index) => { if (!bIndex.has(stopId)) bIndex.set(stopId, index); });
  const runs: Array<[number, number]> = [];
  let start = -1;
  let prevB = -1;
  for (let i = 0; i <= a.length; i++) {
    const bi = i < a.length ? bIndex.get(a[i]) : undefined;
    // A feature's stopOrder can list a platform and its parent station next to each other;
    // as station keys they repeat, which continues the run rather than breaking it.
    const continues = bi !== undefined && start >= 0 && (bi > prevB || (bi === prevB && a[i] === a[i - 1]));
    if (continues) { prevB = bi!; continue; }
    if (start >= 0 && i - 1 > start) runs.push([start, i - 1]);
    start = bi !== undefined ? i : -1;
    prevB = bi ?? -1;
  }
  return runs;
}

function runLengthKm(stopOrder: readonly string[], from: number, to: number, stopsById: ReadonlyMap<string, { lat: number; lon: number }>): number {
  let km = 0;
  for (let i = from; i < to; i++) {
    const a = stopsById.get(stopOrder[i]);
    const b = stopsById.get(stopOrder[i + 1]);
    if (a && b) km += haversineKm(a, b);
  }
  return km;
}

/** Qualifying shared runs of `a` against `b`, after the minimum-length guard. `aStops` are the real stop ids of `a` (for distance) when `a` holds station keys. */
export function qualifyingSharedRuns(
  a: readonly string[],
  b: readonly string[],
  stopsById: ReadonlyMap<string, { lat: number; lon: number }>,
  aStops: readonly string[] = a,
): Array<[number, number]> {
  return alignedSharedRuns(a, b).filter(([from, to]) =>
    new Set(a.slice(from, to + 1)).size >= SHARED_STRETCH_MIN_STOPS
    && runLengthKm(aStops, from, to, stopsById) >= SHARED_STRETCH_MIN_KM);
}

/** One pattern of a route direction: its own departure list and its stop sequence. */
export interface SharedStretchPattern {
  memberKey: string;
  routeId: string;
  /** Headsigns of the pattern's trips (a bus shape can carry several). */
  headsigns: readonly string[];
  stopOrder: readonly string[];
}

export interface SharedStretchContext {
  /**
   * The feature's own pattern: `poolKey` names its route group, direction and day;
   * `memberKey` names its own departures inside it. Null when the feature cannot pool.
   */
  memberOf(feature: GeoJsonFeature): { poolKey: string; memberKey: string } | null;
  /** Every pattern (a shape for buses, a headsign for rail) that ran in the pool. */
  patterns(poolKey: string): readonly SharedStretchPattern[];
  /** `${poolKey}::${memberKey}` -> stopId -> departure minutes (one entry per trip). */
  departures: ReadonlyMap<string, ReadonlyMap<string, number[]>>;
  stopsById: ReadonlyMap<string, { lat: number; lon: number }>;
  /** Child stop -> parent station: stops of one station match across patterns. */
  parentOf: ReadonlyMap<string, string>;
  /** Features that have no stop metrics (partial weekday, previous-night tail). */
  excluded: ReadonlySet<GeoJsonFeature>;
}

/**
 * A feature whose trips may pool: a regular or time-limited LineString, not span and not
 * drop-off-only. process-core also leaves out every feature in partialWeekdayFeatures (partial
 * weekday and previous-night-tail results both land there) when it builds the set of eligible
 * headsigns, and only those headsigns' trips feed the pooled departures.
 */
export function isPoolablePattern(feature: GeoJsonFeature): boolean {
  const p = feature.properties;
  if (feature.geometry.type !== 'LineString') return false;
  if (p.serviceClass !== 'regular' && p.serviceClass !== 'time-limited') return false;
  if (p.tier === 'span') return false;
  return !DROP_OFF_ONLY.test((p.headsign as string | null) ?? '');
}

function eligible(feature: GeoJsonFeature, ctx: SharedStretchContext): boolean {
  const p = feature.properties;
  if (!isPoolablePattern(feature) || ctx.excluded.has(feature)) return false;
  const stopOrder = p.stopOrder as string[] | undefined;
  const stopPositions = p.stopPositions as number[] | undefined;
  return !!stopOrder && stopOrder.length >= 2 && !!stopPositions && stopPositions.length === stopOrder.length;
}

/**
 * Adds `sharedStretches` to features in place. Returns how many features gained them.
 *
 * Per route_id, direction and day: every pattern whose trips carry an eligible feature's
 * headsign takes part, including shapes with no feature of their own (TTC 29 northbound shows
 * one "Wilson" feature, but its trips run on the 29A and 29C shapes). Each member feature gets
 * the ranges of its own stopOrder where its pattern pools with another (computeStopSharers, the
 * same decision its stop values were built with).
 */
export function annotateSharedStretches(features: GeoJsonFeature[], ctx: SharedStretchContext): number {
  type Member = { feature: GeoJsonFeature; poolKey: string; memberKey: string; stopOrder: string[] };
  const groups = new Map<string, Member[]>();
  for (const feature of features) {
    if (!eligible(feature, ctx)) continue;
    const member = ctx.memberOf(feature);
    if (!member || !ctx.departures.has(`${member.poolKey}::${member.memberKey}`)) continue;
    const key = sharedStopGroupKey(feature.properties);
    const list = groups.get(key) ?? [];
    list.push({ feature, ...member, stopOrder: feature.properties.stopOrder as string[] });
    groups.set(key, list);
  }
  const station = (stopId: string) => ctx.parentOf.get(stopId) ?? stopId;

  let annotated = 0;
  for (const members of groups.values()) {
    // Members of one route_id share one stop group (short name, direction, day).
    if (new Set(members.map(m => m.poolKey)).size !== 1) continue;
    const poolKey = members[0].poolKey;
    const routeId = String(members[0].feature.properties.routeId);
    const headsigns = new Set(members.map(m => (m.feature.properties.headsign as string | null) ?? ''));
    const patterns = ctx.patterns(poolKey).filter(pattern =>
      pattern.routeId === routeId
      && pattern.headsigns.some(h => headsigns.has(h))
      && ctx.departures.has(`${poolKey}::${pattern.memberKey}`));
    if (new Set(patterns.map(pattern => pattern.memberKey)).size < 2) continue;
    const sharers = computeStopSharers(patterns, ctx.stopsById, ctx.parentOf);
    const headsignsOf = new Map(patterns.map(pattern => [pattern.memberKey, pattern.headsigns.filter(h => headsigns.has(h))]));
    // A member's route variant: two origins of one destination (TTC 29 "from Dufferin Gate
    // Loop" and "from Princes' Gates Loop", #879 class) are branches of each other under one
    // headsign, and their shared trunk is a stretch.
    const variantOf = new Map(members.map(m => [m.memberKey, ((m.feature.properties.routeVariant as string | null) ?? '').trim()]));

    for (const m of members) {
      const own = sharers.get(m.memberKey);
      if (!own) continue;
      // A stretch is shared with another branch: a same-destination variant pools (its stop
      // values read it) but is the same line, not a stretch (TTC 29C's tail is served by a
      // one-trip 29C variant and by nothing else), unless the two carry different route
      // variants (converging origins), which draw their own rows.
      const ownHeadsign = (m.feature.properties.headsign as string | null) ?? '';
      const ownVariant = variantOf.get(m.memberKey) ?? '';
      const isOtherBranch = (key: string) => (headsignsOf.get(key)?.some(h => h !== ownHeadsign) ?? false)
        || (variantOf.has(key) && variantOf.get(key) !== ownVariant);
      const branchLabels = (key: string): string[] => {
        const labels = (headsignsOf.get(key) ?? []).filter(h => h !== ownHeadsign);
        const variant = variantOf.get(key);
        return labels.length > 0 ? labels : (variant ? [variant] : []);
      };
      const otherBranches = (stopId: string) => [...(own.get(station(stopId)) ?? [])].filter(isOtherBranch);
      // A stop is on a stretch when another branch really has departures there.
      const inStretch = m.stopOrder.map(stopId => otherBranches(stopId)
        .some(key => (ctx.departures.get(`${poolKey}::${key}`)?.get(stopId)?.length ?? 0) > 0));
      const stretches: SharedStretch[] = [];
      for (let i = 0; i < inStretch.length; i++) {
        if (!inStretch[i]) continue;
        let j = i;
        while (j + 1 < inStretch.length && inStretch[j + 1]) j++;
        const others = new Set<string>();
        for (let k = i; k <= j; k++) {
          otherBranches(m.stopOrder[k]).forEach(key => branchLabels(key).forEach(h => others.add(h)));
        }
        stretches.push({ from: i, to: j, with: [...others].sort() });
        i = j;
      }
      if (stretches.length === 0) continue;
      m.feature.properties.sharedStretches = stretches;
      annotated++;
    }
  }
  return annotated;
}

/** Keys this module adds (sharedStops was the pre-#690 pooled-value block; still stripped from older JSON). Tiles leave them out (JSON-only, see prepareAgencyRoutesForTiles). */
export const SHARED_STRETCH_KEYS = ['sharedStretches', 'sharedStops'] as const;
