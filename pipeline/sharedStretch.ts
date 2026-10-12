/**
 * Shared-stretch pooling (CIV-82, phase 1).
 *
 * Stop departures are pooled per shape (#241), because pooling a whole route direction
 * combined unrelated trips (Niagara 301/401 reuse one headsign for two corridors that
 * only meet at a hub stop). That rule stays. This module adds separate values at the
 * stops a route direction's patterns really share: TTC 29 southbound runs 29A and 29C
 * every 16 each over the same 45 stops, so those stops get a bus every 8.
 *
 * Rule (CIV-82): a route may show the stretches that themselves pass; it never makes
 * the whole route pass. Nothing here changes an existing property. New keys only:
 *
 * - sharedStops (on one carrier feature per route, direction and day): per stop, the pooled
 *   stop headway, period medians, period coverage and unsustained periods, computed with the
 *   stopHeadways / stopPeriodHeadways / stopPeriodCoverageHeadways / headwayByPeriodSustained
 *   definitions from the merged real departures of every pattern sharing the stop. Stored
 *   once per group and compact (period arrays) because the browser loads the whole agency
 *   JSON. Read through shared/sharedStops.ts getPooledStop, which returns a value only where
 *   it is strictly lower than the feature's own (otherwise use the feature's own value).
 * - sharedStretches (on each member feature): stopOrder index ranges where its own pattern
 *   shares and a pooled value applies to it, with the headsigns it shares them with.
 * Opposite-direction stops are paired on read (shared/sharedStops.ts pairOppositeStop).
 *
 * Guards against misleading stretches:
 * - Only departures of trips whose headsign an eligible feature draws pool: regular or
 *   time-limited LineString features of the same route_id, direction and day (not span,
 *   irregular, partial-weekday, previous-night-tail or drop-off-only). A bus pattern is a
 *   shape, so a shape's trips under an ineligible headsign are left out, and so are stop
 *   times with pickup_type 1 (drop-off only).
 * - Two patterns share a stop only inside an aligned run: consecutive stops of one
 *   pattern that the other serves in the same order, at least SHARED_STRETCH_MIN_STOPS
 *   stops and SHARED_STRETCH_MIN_KM long. A hub stop or a 2-3 stop overlap never pools.
 * - Each pattern contributes its own departure list once (route + shape for buses,
 *   route + headsign for rail, matching the per-feature metric map), and each trip
 *   counts once per stop (first visit, the stop_times pass rule, #712 / AI-121).
 * - No over-claim: a pooled headway is max(median gap, mean gap), since interleaved
 *   branches put the median on the short gap (DRT 900: 10/14 alternating, median 10,
 *   average 12).
 * - Evenness: a pooled headway is published only when the longest gap between pooled
 *   departures in the same window is at most SHARED_STRETCH_MAX_GAP_RATIO times it.
 *   Internal gaps, not coverage: coverage adds the wait from the window start to the
 *   first bus, which grows along a route (TTC 29 AM: coverage 10 to 27 at a steady 8).
 *   Two 30-minute branches 3 minutes apart (gaps 3/27) give a median near 15 but a
 *   27-minute gap, so no "every 15" is published for them. Coverage and the sustained
 *   flag are stored only with a stored median (the shared filter reads them together);
 *   an unsustained flag is stored only where a reader's own flag is not sustained.
 */
import { PERIOD_KEYS, TIME_PERIODS, type HeadwayByPeriod, type PeriodKey } from '../shared/config.js';
import {
  computePeriodCoverageHeadways,
  computePeriodSustained,
  forCrossMidnightWindow,
  medianHeadwayInWindow,
  sustainedMedianHeadwayInWindow,
} from './headway-utils.js';
import type { GeoJsonFeature } from './geojson-types.js';
import { hasPooledStop, sharedStopGroupKey, type SharedStop, type SharedStretch } from '../shared/sharedStops.js';

export const SHARED_STRETCH_MIN_STOPS = 5;
export const SHARED_STRETCH_MIN_KM = 1;
export const SHARED_STRETCH_MAX_GAP_RATIO = 1.5;

const PERIODS = Object.fromEntries(
  TIME_PERIODS.map(p => [p.key, { start: p.startHour * 60, end: p.endHour * 60 }]),
) as Record<PeriodKey, { start: number; end: number }>;

const DROP_OFF_ONLY = /drop[- ]?offs?\s+only/i;

export interface PooledStopMetrics {
  headway: number | null;
  byPeriod: Partial<Record<PeriodKey, number>>;
  coverage: HeadwayByPeriod;
  /** Same flag as headwayByPeriodSustained (the shared filter reads it with coverage). */
  sustained: Partial<Record<PeriodKey, boolean>>;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const p = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * p) / 2) ** 2
    + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(((b.lon - a.lon) * p) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

/**
 * Longest gap between consecutive departures inside [start, end]. Unlike coverage it leaves
 * out the waits from the window edge to the first and from the last departure: those grow
 * along a route as the first trip reaches later stops (TTC 29 AM coverage climbs from 10 to
 * 27 over the shared stretch at a steady 8), and they are not branch bunching.
 */
function maxInternalGap(times: readonly number[], start: number, end: number): number | null {
  const inWindow = [...new Set(forCrossMidnightWindow([...times], end))]
    .filter(t => t >= start && t <= end)
    .sort((a, b) => a - b);
  if (inWindow.length < 2) return null;
  let worst = 0;
  for (let i = 1; i < inWindow.length; i++) worst = Math.max(worst, inWindow[i] - inWindow[i - 1]);
  return worst;
}

/**
 * Process-wide counts of pooled medians kept and dropped by the evenness guard. Diagnostics
 * only (validation harness); nothing reads them in the pipeline.
 */
export const sharedStretchGuardStats = { kept: 0, dropped: 0 };

/** Pooled gaps are even enough when no gap inside the window exceeds the ratio times the headway. */
function evenEnough(headway: number, times: readonly number[], start: number, end: number): boolean {
  const gap = maxInternalGap(times, start, end);
  const even = gap != null && gap <= SHARED_STRETCH_MAX_GAP_RATIO * headway;
  if (even) sharedStretchGuardStats.kept++;
  else sharedStretchGuardStats.dropped++;
  return even;
}

/** Mean gap between deduplicated departures inside [start, end] (null under 2 departures). */
function meanGapInWindow(times: readonly number[], start: number, end: number): number | null {
  const inWindow = [...new Set(forCrossMidnightWindow([...times], end))]
    .filter(t => t >= start && t <= end)
    .sort((a, b) => a - b);
  if (inWindow.length < 2) return null;
  return (inWindow[inWindow.length - 1] - inWindow[0]) / (inWindow.length - 1);
}

/**
 * A pooled headway never claims better than the average gap: interleaved branches put the
 * median on the short gap (DRT 900 alternates 10/14 minutes, median 10, average 12; 14/18 would
 * read 14 against an average of 16 and pass a 15-minute filter). The published value is
 * max(median, rounded mean gap), and the evenness guard is applied to that value.
 */
function pooledHeadway(median: number | null, times: readonly number[], start: number, end: number): number | null {
  if (median == null) return null;
  const mean = meanGapInWindow(times, start, end);
  const value = mean == null ? median : Math.max(median, Math.round(mean));
  return evenEnough(value, times, start, end) ? value : null;
}

/**
 * The per-stop metrics of process-core's Step 1, on one merged departure list: the same
 * windows and medians as stopHeadways / stopPeriodHeadways / stopPeriodCoverageHeadways, raised
 * to the mean gap where that is longer (pooledHeadway), then the evenness guard.
 */
export function pooledStopMetrics(departures: readonly number[]): PooledStopMetrics {
  const times = [...departures].sort((a, b) => a - b);
  const coverage = computePeriodCoverageHeadways(times);
  // Step 1: midday 9-15h, then PM peak 15-19h, then a sustained 6-22h median.
  const midday = medianHeadwayInWindow(times, 540, 900, 3);
  const pm = midday == null ? medianHeadwayInWindow(times, 900, 1140, 3) : null;
  const allDay = midday == null && pm == null ? sustainedMedianHeadwayInWindow(times, 360, 1320, 3) : null;
  const headway = midday != null
    ? pooledHeadway(midday, times, 540, 900)
    : pm != null
      ? pooledHeadway(pm, times, 900, 1140)
      : pooledHeadway(allDay, times, 360, 1320);
  const byPeriod: Partial<Record<PeriodKey, number>> = {};
  for (const pk of PERIOD_KEYS) {
    const { start, end } = PERIODS[pk];
    const ph = pooledHeadway(medianHeadwayInWindow(forCrossMidnightWindow(times, end), start, end, 3), times, start, end);
    if (ph != null) byPeriod[pk] = ph;
  }
  return { headway, byPeriod, coverage, sustained: computePeriodSustained(times) };
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
 * drop-off-only. process-core also leaves out partial-weekday and previous-night-tail features,
 * and only these features' headsigns feed the pooled departures.
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
 * Adds the shared-stretch keys to features in place. Returns how many features gained them.
 *
 * Per route_id, direction and day: every pattern whose trips carry an eligible feature's
 * headsign takes part, including shapes with no feature of their own (TTC 29 northbound shows
 * one "Wilson" feature, but its trips run on the 29A and 29C shapes). At each station on a
 * qualifying run between two patterns, the pooled departures are those of every pattern with
 * a qualifying run through that station. Values are stored once, on the group's carrier
 * feature (its first eligible member in feature order, so the choice is stable), in
 * `sharedStops`. Each member feature gets `sharedStretches` over the stops of its own
 * stopOrder where its pattern takes part and a pooled value is strictly lower than its own.
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

    // Station -> patterns with a qualifying shared run through it.
    const sharing = new Map<string, Set<string>>();
    const stationsOf = patterns.map(pattern => pattern.stopOrder.map(station));
    patterns.forEach((pattern, a) => {
      patterns.forEach((other, b) => {
        if (a === b || pattern.memberKey === other.memberKey) return;
        for (const [from, to] of qualifyingSharedRuns(stationsOf[a], stationsOf[b], ctx.stopsById, pattern.stopOrder)) {
          for (let i = from; i <= to; i++) {
            const set = sharing.get(stationsOf[a][i]) ?? new Set<string>();
            set.add(pattern.memberKey);
            set.add(other.memberKey);
            sharing.set(stationsOf[a][i], set);
          }
        }
      });
    });
    if (sharing.size === 0) continue;
    const headsignsOf = new Map(patterns.map(pattern => [pattern.memberKey, pattern.headsigns.filter(h => headsigns.has(h))]));

    // Pooled metrics per stop id, from every pattern sharing its station.
    const metricsCache = new Map<string, PooledStopMetrics | null>();
    const metricsFor = (stopId: string): PooledStopMetrics | null => {
      if (metricsCache.has(stopId)) return metricsCache.get(stopId)!;
      const keys = [...(sharing.get(station(stopId)) ?? [])].sort();
      const times: number[] = [];
      let contributors = 0;
      for (const key of keys) {
        const deps = ctx.departures.get(`${poolKey}::${key}`)?.get(stopId);
        if (deps && deps.length > 0) { times.push(...deps); contributors++; }
      }
      // A pooled value needs real departures from at least two patterns at this stop.
      const result = contributors >= 2 ? pooledStopMetrics(times) : null;
      metricsCache.set(stopId, result);
      return result;
    };

    // Store a value only when it is strictly lower than the own value of at least one member
    // whose pattern shares that stop; getPooledStop applies the per-feature check on read.
    const improves = (pooled: number | null | undefined, own: number | null | undefined) =>
      pooled != null && (own == null || pooled < own);
    const sharers = (stopId: string) => members.filter(m =>
      sharing.get(station(stopId))?.has(m.memberKey) && m.stopOrder.includes(stopId));
    const block: Record<string, SharedStop> = {};
    for (const stopId of new Set(members.flatMap(m => m.stopOrder))) {
      if (!sharing.has(station(stopId))) continue;
      const users = sharers(stopId);
      if (users.length === 0) continue;
      const metrics = metricsFor(stopId);
      if (!metrics) continue;
      const own = (m: Member, key: string) => (m.feature.properties[key] as Record<string, any> | undefined)?.[stopId];
      const stop: SharedStop = {};
      if (users.some(m => improves(metrics.headway, own(m, 'stopHeadways')))) stop.headway = metrics.headway!;
      const periods: Array<number | null> = PERIOD_KEYS.map(() => null);
      const coverage: Array<number | null> = PERIOD_KEYS.map(() => null);
      const unsustained: PeriodKey[] = [];
      PERIOD_KEYS.forEach((pk, i) => {
        const median = metrics.byPeriod[pk];
        const medianUsers = users.filter(m => improves(median, own(m, 'stopPeriodHeadways')?.[pk]));
        if (medianUsers.length === 0) return;
        periods[i] = median!;
        // Coverage and the sustained flag only go with a published median.
        if (medianUsers.some(m => improves(metrics.coverage[pk], own(m, 'stopPeriodCoverageHeadways')?.[pk]))) coverage[i] = metrics.coverage[pk]!;
        // Never worse: an unsustained pooled flag only matters to a reader whose own is not sustained.
        if (metrics.sustained[pk] === false
          && medianUsers.some(m => (m.feature.properties.headwayByPeriodSustained as Record<string, boolean> | undefined)?.[pk] !== true)) {
          unsustained.push(pk);
        }
      });
      const trimmed = (values: Array<number | null>) => {
        let end = values.length;
        while (end > 0 && values[end - 1] == null) end--;
        return values.slice(0, end);
      };
      if (trimmed(periods).length > 0) stop.periods = trimmed(periods);
      if (trimmed(coverage).length > 0) stop.coverage = trimmed(coverage);
      if (unsustained.length > 0) stop.unsustained = unsustained;
      if (stop.headway != null || stop.periods != null) block[stopId] = stop;
    }
    if (Object.keys(block).length === 0) continue;

    // Stretches per member: its stops where its pattern shares and a pooled value applies.
    const index = new Map([[sharedStopGroupKey(members[0].feature.properties), block]]);
    let carrier: Member | null = null;
    for (const m of members) {
      const p = m.feature.properties;
      const inStretch = m.stopOrder.map(stopId =>
        !!sharing.get(station(stopId))?.has(m.memberKey)
        && hasPooledStop(index, { ...p, sharedStretches: [{ from: 0, to: m.stopOrder.length - 1, with: [] }] }, stopId));
      const stretches: SharedStretch[] = [];
      for (let i = 0; i < inStretch.length; i++) {
        if (!inStretch[i]) continue;
        let j = i;
        while (j + 1 < inStretch.length && inStretch[j + 1]) j++;
        const others = new Set<string>();
        for (let k = i; k <= j; k++) {
          sharing.get(station(m.stopOrder[k]))?.forEach(key => {
            if (key !== m.memberKey) headsignsOf.get(key)?.forEach(h => others.add(h));
          });
        }
        stretches.push({ from: i, to: j, with: [...others].sort() });
        i = j;
      }
      if (stretches.length === 0) continue;
      p.sharedStretches = stretches;
      carrier ??= m;
      annotated++;
    }
    if (carrier) carrier.feature.properties.sharedStops = block;
  }
  return annotated;
}

/** Keys this module adds. Tiles leave them out (JSON-only, see prepareAgencyRoutesForTiles). */
export const SHARED_STRETCH_KEYS = ['sharedStretches', 'sharedStops'] as const;
