import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import type { PeriodKey } from '../../shared/config';
import { clipBetweenStopIndices, clipLinestring } from './lineClip';
import { headwayToTierColor, type ColorVisionMode } from './colors';
import { featurePassesHeadwayFilter, routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { PERIOD_KEYS } from '../../shared/config';
import { splitRouteKey } from './routeKey';
import {
  buildSharedStopIndex,
  getPooledPeriod,
  getPooledStop,
  oppositeSharedStops,
  pairOppositeStop,
  type SharedStopIndex,
} from '../../shared/sharedStops';

/** Identifies one route feature (a single direction/headsign/day shape) for MapLibre filter matching. */
export interface FrequencySegmentRouteKey {
  agencySlug: string;
  routeId: string;
  directionId: number;
  headsign: string | null;
  day: string | null;
}

export interface FrequencySegmentOverlay {
  /** Bright, full-color GeoJSON line features for the qualifying stretch(es) of partial-match routes. */
  segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[];
  /** Routes that pass the active frequency filter only because part of their stops qualify --
   *  these get their base line dimmed so the bright overlay reads as "the real qualifying part." */
  partialMatches: FrequencySegmentRouteKey[];
  /** Route features that fail the filter but draw a passing shared stretch (CIV-82). Not partial
   *  matches: they stay out of the base layer, except for the selected route (#850). */
  sharedStretchRoutes: SharedStretchRouteKey[];
}

export interface SharedStretchRouteKey extends FrequencySegmentRouteKey {
  routeBranch: string | null;
}

interface FrequencySegmentProperties {
  color: string;
  agencySlug: string;
  routeId: string;
  routeBranch: string | null;
  directionId: number;
  headsign: string | null;
  day: string | null;
}

/**
 * Maximal contiguous stop-index ranges (>=2 stops, so there's an actual line to draw) whose
 * headway at every stop in the range is present and <= maxHeadway. A stop with no headway data
 * for the active metric breaks a run -- this only ever claims a stretch qualifies when the data
 * actually supports it (never assumes an unset stop is fine).
 */
export function findQualifyingStopRanges(
  stopOrder: readonly string[],
  headwayAt: (stopId: string) => number | null | undefined,
  maxHeadway: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let runStart: number | null = null;
  for (let i = 0; i < stopOrder.length; i++) {
    const hw = headwayAt(stopOrder[i]);
    const qualifies = hw != null && hw <= maxHeadway;
    if (qualifies) {
      if (runStart === null) runStart = i;
    } else {
      if (runStart !== null && i - 1 > runStart) ranges.push([runStart, i - 1]);
      runStart = null;
    }
  }
  if (runStart !== null && stopOrder.length - 1 > runStart) ranges.push([runStart, stopOrder.length - 1]);
  return ranges;
}

function stopHeadwayAt(p: ShapeProperties, period: TimePeriod, stopId: string): number | null {
  if (period !== 'all') {
    // Coverage headway measures the largest gap in the service window. It is not
    // the route's scheduled frequency and can be much larger near the first/last
    // trip of a period (for example DART 25/57 are scheduled every 20 minutes at
    // every stop but have large period-coverage gaps). Use the same scheduled
    // per-stop metric that the all-day view uses for segment highlighting.
    const v = p.stopPeriodHeadways?.[stopId]?.[period as PeriodKey];
    return v ?? null;
  }
  return p.stopHeadways?.[stopId] ?? null;
}

function branchHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  if (period !== 'all') return p.headwayByPeriod?.[period as PeriodKey] ?? null;
  return p.headway ?? null;
}

function combinedHeadway(values: number[]): number | null {
  const valid = values.filter(v => Number.isFinite(v) && v > 0);
  if (valid.length < 2) return null;
  return Math.max(1, Math.round(1 / valid.reduce((sum, value) => sum + 1 / value, 0)));
}

function featureKey(key: FrequencySegmentRouteKey): string {
  return [key.agencySlug, key.routeId, key.directionId, key.headsign ?? '', key.day ?? ''].join('|');
}

function addClippedSegments(
  feature: GeoJSON.Feature,
  p: ShapeProperties,
  slug: string,
  ranges: Array<[number, number]>,
  maxHeadway: number,
  segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[],
  colorMode: ColorVisionMode,
  includeShapeEndpoints = false,
): boolean {
  if (feature.geometry.type !== 'LineString' || !p.stopPositions || !p.stopOrder) return false;
  let added = false;
  for (const [from, to] of ranges) {
    const clipped = includeShapeEndpoints
      ? clipLinestring(
        feature.geometry.coordinates,
        from === 0 ? 0 : (p.stopPositions[from] + p.stopPositions[from - 1]) / 2,
        to === p.stopPositions.length - 1 ? 1 : (p.stopPositions[to] + p.stopPositions[to + 1]) / 2,
      )
      : clipBetweenStopIndices(feature.geometry.coordinates, p.stopPositions, from, to);
    if (!clipped) continue;
    segments.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: clipped },
      properties: {
        color: headwayToTierColor(maxHeadway, colorMode),
        agencySlug: p.agencySlug ?? slug,
        routeId: p.routeId,
        routeBranch: (p as any).routeBranch ?? null,
        directionId: p.directionId,
        headsign: p.headsign ?? null,
        day: p.day ?? null,
      },
    });
    added = true;
  }
  return added;
}

/**
 * Partial-segment rendering is only allowed on a feature that already passes the one frequency
 * rule (shared/routeHeadwayFilter: worst direction decides, identical to the map filter).
 * Otherwise a busy stretch in one direction could pull an excluded route back onto the map.
 */
function routePassesFrequencyFilter(p: ShapeProperties, period: TimePeriod, maxHeadway: number): boolean {
  return featurePassesHeadwayFilter(p, period, maxHeadway);
}

/**
 * One stop of a route feature as the shared frequency rule sees it (CIV-82): the pooled value
 * from shared/sharedStops where it applies to this feature, otherwise the feature's own value,
 * metric by metric. The feature-level sustained flag stands in where no pooled flag applies (the
 * pipeline publishes no per-stop own flag). Judged with featurePassesHeadwayFilter, the same
 * function the map uses for whole routes, never a pooled-only test.
 */
export function sharedStopFilterView(
  index: SharedStopIndex,
  p: ShapeProperties,
  stopId: string,
  /** Fill only what this period's filter reads ('all': the stop headway alone). */
  onlyPeriod?: TimePeriod,
): Record<string, unknown> {
  const pooled = (metric: Parameters<typeof getPooledStop>[3]) => getPooledStop(index, p, stopId, metric);
  const headwayByPeriod: Record<string, number | null> = {};
  const periodCoverageHeadway: Record<string, number | null> = {};
  const headwayByPeriodSustained: Record<string, boolean> = {};
  const periods = onlyPeriod == null ? PERIOD_KEYS : onlyPeriod === 'all' ? [] : [onlyPeriod as PeriodKey];
  if (onlyPeriod === 'all') {
    // #899: a route with a direction that has no midday service passes no all-day threshold, so
    // none of its stretches do either.
    return {
      tier: p.tier,
      headway: (pooled('headway') as number | undefined) ?? p.stopHeadways?.[stopId] ?? null,
      ...(p.routeHasNoMiddayDirection === true ? { routeHasNoMiddayDirection: true } : {}),
    };
  }
  if (onlyPeriod != null) {
    const pk = onlyPeriod as PeriodKey;
    const pooledPeriod = getPooledPeriod(index, p, stopId, pk);
    const sustained = pooledPeriod.sustained ?? p.headwayByPeriodSustained?.[pk];
    return {
      tier: p.tier,
      headwayByPeriod: { [pk]: pooledPeriod.median ?? p.stopPeriodHeadways?.[stopId]?.[pk] ?? null },
      periodCoverageHeadway: { [pk]: pooledPeriod.coverage ?? p.stopPeriodCoverageHeadways?.[stopId]?.[pk] ?? null },
      headwayByPeriodSustained: sustained != null ? { [pk]: sustained } : {},
    };
  }
  for (const pk of periods) {
    const median = pooled(`median:${pk}`);
    headwayByPeriod[pk] = (median as number | undefined) ?? p.stopPeriodHeadways?.[stopId]?.[pk] ?? null;
    periodCoverageHeadway[pk] = (pooled(`coverage:${pk}`) as number | undefined)
      ?? p.stopPeriodCoverageHeadways?.[stopId]?.[pk] ?? null;
    const sustained = (pooled(`sustained:${pk}`) as boolean | undefined) ?? p.headwayByPeriodSustained?.[pk];
    if (sustained != null) headwayByPeriodSustained[pk] = sustained;
  }
  return {
    tier: p.tier,
    headway: (pooled('headway') as number | undefined) ?? p.stopHeadways?.[stopId] ?? null,
    headwayByPeriod,
    periodCoverageHeadway,
    headwayByPeriodSustained,
  };
}

interface StopPoint { lat: number; lon: number }

type StretchProps = ShapeProperties & { sharedStretches?: Array<{ from: number; to: number }> };

/** A missing or non-numeric direction_id counts as 0 (oppositeSharedStops uses the same rule). */
function directionOf(q: ShapeProperties): number {
  const n = Number(q.directionId);
  return q.directionId == null || !Number.isFinite(n) ? 0 : n;
}

/**
 * Everything about one agency's features that does not depend on the filter, built once per
 * features array and reused on every filter change: the pooled index, stop coordinates, features
 * grouped by route + day + direction, opposite-direction candidates and pairings, and each
 * (feature, period, stop)'s filter value.
 */
interface SharedPassContext {
  index: SharedStopIndex;
  coords: Map<string, StopPoint>;
  groups: Map<string, Map<number, StretchProps[]>>;
  pairCache: Map<string, string | null>;
  candidateCache: Map<string, string[]>;
  byStopCache: Map<string, Map<string, StretchProps[]>>;
  values: WeakMap<object, Map<string, number | null>>;
  viewValues: Map<string, number | null>;
}
const passContexts = new WeakMap<readonly GeoJSON.Feature[], SharedPassContext>();

function sharedPassContext(allFeatures: readonly GeoJSON.Feature[]): SharedPassContext {
  const cached = passContexts.get(allFeatures);
  if (cached) return cached;
  const coords = new Map<string, StopPoint>();
  const groups = new Map<string, Map<number, StretchProps[]>>();
  for (const f of allFeatures) {
    const p = f.properties as any;
    if (f.geometry?.type === 'Point' && p?.stopId != null) {
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      coords.set(String(p.stopId), { lat, lon });
    } else if (f.geometry?.type === 'LineString' && p?.stopOrder?.length) {
      const key = `${p.routeId}|${p.day ?? ''}`;
      const byDir = groups.get(key) ?? new Map<number, StretchProps[]>();
      const dir = directionOf(p);
      byDir.set(dir, [...(byDir.get(dir) ?? []), p]);
      groups.set(key, byDir);
    }
  }
  const ctx: SharedPassContext = {
    index: buildSharedStopIndex(allFeatures),
    coords,
    groups,
    pairCache: new Map(),
    candidateCache: new Map(),
    byStopCache: new Map(),
    values: new WeakMap(),
    viewValues: new Map(),
  };
  passContexts.set(allFeatures, ctx);
  return ctx;
}

/**
 * The shared filter's value at one stop of one feature: routeFilterHeadway (the map's rule:
 * median, coverage and sustained) on the pooled-or-own view. A stop passes a threshold exactly
 * when this is non-null and at most the threshold (featurePassesHeadwayFilter's clause), so the
 * value is memoized per (feature, period, stop) and reused across thresholds.
 */
function stopFilterValue(ctx: SharedPassContext, p: ShapeProperties, stopId: string, period: TimePeriod): number | null {
  let byKey = ctx.values.get(p);
  if (!byKey) { byKey = new Map(); ctx.values.set(p, byKey); }
  const key = `${period}|${stopId}`;
  if (byKey.has(key)) return byKey.get(key)!;
  // The filter's inputs at this stop for this period (pooled where better, else the stop's own);
  // the value is a pure function of them, so each distinct input set is evaluated once, and the
  // view object is only built on a miss.
  let viewKey: string;
  if (period === 'all') {
    const pooled = getPooledStop(ctx.index, p, stopId, 'headway') as number | undefined;
    viewKey = `all|${p.tier}|${pooled ?? p.stopHeadways?.[stopId] ?? null}|${p.routeHasNoMiddayDirection === true}`;
  } else {
    const pk = period as PeriodKey;
    const pooled = getPooledPeriod(ctx.index, p, stopId, pk);
    viewKey = `${pk}|${p.tier}|${pooled.median ?? p.stopPeriodHeadways?.[stopId]?.[pk] ?? null}`
      + `|${pooled.coverage ?? p.stopPeriodCoverageHeadways?.[stopId]?.[pk] ?? null}`
      + `|${pooled.sustained ?? p.headwayByPeriodSustained?.[pk]}`;
  }
  let value = ctx.viewValues.get(viewKey);
  if (value === undefined) {
    const view = sharedStopFilterView(ctx.index, p, stopId, period);
    // #899: the filter clause fails a flagged route at every all-day threshold; the stop value
    // follows it (routeFilterHeadway alone is the colour value and does not read the flag).
    value = period === 'all' && view.routeHasNoMiddayDirection === true ? null : routeFilterHeadway(view, period);
    ctx.viewValues.set(viewKey, value);
  }
  byKey.set(key, value);
  return value;
}

export interface SharedStretchPassResult {
  feature: GeoJSON.Feature;
  ranges: Array<[number, number]>;
  /** Worst filter value of both directions at each qualifying stop index (tier colour). */
  values: Map<number, number>;
  /** This direction's own filter value at each qualifying stop index (the route card's N). */
  ownValues: Map<number, number>;
}

/**
 * The one per-stop pass behind the shared-stretch overlay AND the route card's "Shared stretch
 * every N" (CIV-82): a route may show the stretches that themselves pass; it never makes the whole
 * route pass. A stop qualifies when its pooled-or-own value passes the shared filter AND the
 * matching stop of the opposite direction passes too, judged the same way on the best opposite
 * feature there. With maxHeadway Infinity every stop with a value on both sides qualifies (the
 * card's no-filter view). Since #690 a feature's own stop values already count every pattern
 * serving the stop; `sharedStretches` says which stops those are. Features without stretches
 * give nothing, unless they are the single-pattern direction described below.
 *
 * A direction run as ONE pattern (its own stop values already count every trip, e.g. NYCT B
 * "Beach", CTA Green "Harlem-Green") draws along the stops that pair with the branched
 * direction's shared stretches. On that path a stop pairs only with a stop strictly inside a
 * branched stretch (never its end stop), so the 300 m nearest pairing cannot reach one stop past
 * the branch point.
 */
export function sharedStretchStopPass(
  routeFeatures: readonly GeoJSON.Feature[],
  allFeatures: readonly GeoJSON.Feature[],
  period: TimePeriod,
  maxHeadway: number,
  options: { includePassing?: boolean } = {},
): SharedStretchPassResult[] {
  const out: SharedStretchPassResult[] = [];
  const ctx = sharedPassContext(allFeatures);
  const passes = (v: number | null): v is number => v != null && v <= maxHeadway;
  const hasStretches = (q: StretchProps) => !!q.sharedStretches?.length;

  for (const f of routeFeatures) {
    if (f.geometry?.type !== 'LineString') continue;
    const p = f.properties as unknown as StretchProps;
    if (!p.stopOrder || !p.stopPositions || p.stopPositions.length !== p.stopOrder.length) continue;
    if (!options.includePassing && featurePassesHeadwayFilter(p, period, maxHeadway)) continue; // passing routes: handled above
    const groupKey = `${p.routeId}|${p.day ?? ''}`;
    const byDir = ctx.groups.get(groupKey);
    if (!byDir) continue;
    const dir = directionOf(p);
    const opposite = [...byDir.entries()].filter(([d]) => d !== dir).flatMap(([, list]) => list);
    if (opposite.length === 0) continue;
    const single = !hasStretches(p);
    if (single && ((byDir.get(dir)?.length ?? 0) !== 1 || !opposite.some(hasStretches))) continue;

    // Candidate opposite stops (cached per group, direction and path).
    const candKey = `${groupKey}|${dir}|${single ? 'single' : 'branch'}`;
    let candidates = ctx.candidateCache.get(candKey);
    if (!candidates) {
      if (single) {
        // Only stops strictly inside a branched stretch: never a stretch's end stop.
        const inner = new Set<string>();
        for (const q of opposite) {
          for (const st of q.sharedStretches ?? []) {
            for (let i = st.from + 1; i < st.to; i++) if (q.stopOrder![i] != null) inner.add(q.stopOrder![i]);
          }
        }
        candidates = [...inner];
      } else {
        candidates = oppositeSharedStops(opposite, p);
      }
      ctx.candidateCache.set(candKey, candidates);
    }
    let byStop = ctx.byStopCache.get(candKey);
    if (!byStop) {
      byStop = new Map();
      for (const q of opposite) for (const s of q.stopOrder ?? []) byStop.set(s, [...(byStop.get(s) ?? []), q]);
      ctx.byStopCache.set(candKey, byStop);
    }

    const stretchIndices = single ? null : new Set<number>();
    if (stretchIndices) for (const st of p.sharedStretches!) for (let i = st.from; i <= st.to; i++) stretchIndices.add(i);
    const values = new Map<number, number>();
    const ownValues = new Map<number, number>();
    const qualifying: boolean[] = p.stopOrder.map((stopId, i) => {
      if (stretchIndices && !stretchIndices.has(i)) return false;
      const own = stopFilterValue(ctx, p, stopId, period);
      if (!passes(own)) return false;
      // Every direction must pass at the matching stop.
      const pairKey = `${candKey}|${stopId}`;
      let o = ctx.pairCache.get(pairKey);
      if (o === undefined) {
        o = pairOppositeStop(stopId, candidates!, ctx.coords);
        ctx.pairCache.set(pairKey, o);
      }
      if (o == null) return false;
      let best: number | null = null;
      for (const q of byStop!.get(o) ?? []) {
        const v = stopFilterValue(ctx, q, o, period);
        if (passes(v) && (best == null || v < best)) best = v;
      }
      if (best == null) return false;
      values.set(i, Math.max(own, best));
      ownValues.set(i, own);
      return true;
    });
    const ranges = findQualifyingStopRanges(p.stopOrder.map((_, i) => String(i)), i => (qualifying[Number(i)] ? 0 : null), 0);
    if (ranges.length > 0) out.push({ feature: f, ranges, values, ownValues });
  }
  return out;
}

/** The overlay's per-stop pass for routes that FAIL the active filter (see sharedStretchStopPass). */
export function failingRouteSharedRanges(
  routeFeatures: readonly GeoJSON.Feature[],
  allFeatures: readonly GeoJSON.Feature[],
  period: TimePeriod,
  maxHeadway: number,
): SharedStretchPassResult[] {
  if (maxHeadway === Infinity || !routeFeatures.some(f => (f.properties as any)?.sharedStretches)) return [];
  return sharedStretchStopPass(routeFeatures, allFeatures, period, maxHeadway);
}

function addFailingRouteSharedStretches(
  slug: string,
  routeFeatures: GeoJSON.Feature[],
  allFeatures: GeoJSON.Feature[],
  period: TimePeriod,
  maxHeadway: number,
  colorMode: ColorVisionMode,
  segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[],
): void {
  for (const { feature, ranges, values } of failingRouteSharedRanges(routeFeatures, allFeatures, period, maxHeadway)) {
    const p = feature.properties as unknown as ShapeProperties;
    for (const [from, to] of ranges) {
      const clipped = clipBetweenStopIndices((feature.geometry as GeoJSON.LineString).coordinates, p.stopPositions!, from, to);
      if (!clipped) continue;
      let repHw = 0;
      for (let i = from; i <= to; i++) repHw = Math.max(repHw, values.get(i) ?? maxHeadway);
      segments.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: clipped },
        properties: {
          // Same tier palette as every route line: the worst filter value on the stretch.
          color: headwayToTierColor(repHw || maxHeadway, colorMode),
          agencySlug: p.agencySlug ?? slug,
          routeId: p.routeId,
          routeBranch: (p as any).routeBranch ?? null,
          directionId: p.directionId,
          headsign: p.headsign ?? null,
          day: p.day ?? null,
        },
      });
    }
  }
}

/**
 * Client-side stand-in for per-segment PMTiles rendering (not possible -- #317: tippecanoe
 * JSON-stringifies stopOrder/stopPositions/stopHeadways into scalar tile properties, unusable in
 * MapLibre filter/paint expressions, and line-gradient needs a GeoJSON source with lineMetrics,
 * not vector tiles). Walks the raw per-agency GeoJSON already held in React state for the map
 * (real, parsed per-stop headway data, unlike the PMTiles copy) and finds routes where the active
 * frequency filter is passing only because of a sub-stretch of stops, not the whole shape.
 *
 * Generalized across periods (including 'all') rather than gated to the period case that was
 * reported. A route must pass the route-level metric first; this overlay only explains uneven
 * stop-level coverage within a route that already qualifies in both directions.
 */
export function computeFrequencySegmentOverlay(
  layers: AgencyLayers,
  period: TimePeriod,
  maxHeadway: number,
  colorMode: ColorVisionMode = 'default',
  /** Unfiltered agency layers: stop coordinates, the carrier's sharedStops and the opposite
   *  direction for the CIV-82 shared-stretch pass. Defaults to `layers`. */
  allLayers: AgencyLayers = layers,
): FrequencySegmentOverlay {
  const segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[] = [];
  const partialMatches: FrequencySegmentRouteKey[] = [];
  const sharedStretchRoutes: SharedStretchRouteKey[] = [];
  if (maxHeadway === Infinity) return { segments, partialMatches, sharedStretchRoutes };

  const partialKeys = new Map<string, FrequencySegmentRouteKey>();
  const markPartial = (p: ShapeProperties, slug: string) => {
    const key: FrequencySegmentRouteKey = {
      agencySlug: p.agencySlug ?? slug,
      routeId: p.routeId,
      directionId: p.directionId,
      headsign: p.headsign ?? null,
      day: p.day ?? null,
    };
    partialKeys.set(featureKey(key), key);
  };

  for (const [slug, fc] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
    const groups = new Map<string, GeoJSON.Feature[]>();
    for (const feature of fc.features) {
      if (feature.geometry.type !== 'LineString') continue;
      const p = feature.properties as unknown as ShapeProperties;
      if (!p.stopOrder || !p.stopPositions || p.stopOrder.length < 2 || p.stopPositions.length !== p.stopOrder.length) continue;
      const key = [slug, p.routeId, (p as any).routeBranch ?? '', p.directionId, p.day ?? ''].join('|');
      groups.set(key, [...(groups.get(key) ?? []), feature]);
    }

    for (const f of fc.features) {
      if (f.geometry.type !== 'LineString') continue;
      const p = f.properties as unknown as ShapeProperties;
      if (!routePassesFrequencyFilter(p, period, maxHeadway)) continue;
      const stopOrder = p.stopOrder;
      const stopPositions = p.stopPositions;
      if (!stopOrder || !stopPositions || stopOrder.length < 2 || stopPositions.length !== stopOrder.length) continue;

      const ranges = findQualifyingStopRanges(stopOrder, id => stopHeadwayAt(p, period, id), maxHeadway);
      if (ranges.length === 0) continue; // no on-shape stop data supports a qualifying stretch -- leave as-is, don't guess
      const fullyQualifies = ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === stopOrder.length - 1;
      if (fullyQualifies) continue; // whole route already qualifies -- base rendering is already correct

      const coords = f.geometry.coordinates;
      for (const [from, to] of ranges) {
        const clipped = clipBetweenStopIndices(coords, stopPositions, from, to);
        if (!clipped) continue;
        const hwVals = stopOrder
          .slice(from, to + 1)
          .map(id => stopHeadwayAt(p, period, id))
          .filter((v): v is number => v != null);
        const repHw = hwVals.length > 0 ? Math.max(...hwVals) : maxHeadway;
        segments.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: clipped },
          properties: {
            color: headwayToTierColor(repHw, colorMode),
            agencySlug: p.agencySlug ?? slug,
            routeId: p.routeId,
            routeBranch: (p as any).routeBranch ?? null,
            directionId: p.directionId,
            headsign: p.headsign ?? null,
            day: p.day ?? null,
          },
        });
      }

      markPartial(p, slug);
    }

    // A shared core uses the branch cadences shown in the route card and used by the map filter.
    // Stop-level values can be noisy (MARTA 121 reports 32/33/30 at different shared stops even
    // though both branches are displayed as every 30), which otherwise cuts one core into pieces.
    for (const group of groups.values()) {
      // Reciprocals of medians (or maximum waits) cannot prove combined coverage.
      if (period !== 'all' && group.some(f => {
        const p = f.properties as unknown as ShapeProperties;
        return p.periodCoverageHeadway !== undefined || p.worstDirectionPeriodCoverageHeadway !== undefined;
      })) continue;
      const branches = group
        .map(feature => ({ feature, p: feature.properties as unknown as ShapeProperties }))
        .filter(({ p }) => p.tier !== 'span' && p.tier !== 'infrequent')
        .filter(({ p }) => !/drop[- ]?offs?\s+only/i.test(p.headsign ?? ''));
      const distinctHeadsigns = new Set(branches.map(({ p }) => p.headsign ?? ''));
      if (branches.length < 2 || distinctHeadsigns.size < 2) continue;
      // A combined shared-core cadence is one direction's busiest stretch. It may only narrow the
      // display of a route that already passes in every direction, never make a failing route
      // (or branch) appear on the map.
      if (!branches.every(({ p }) => routePassesFrequencyFilter(p, period, maxHeadway))) continue;
      if (!branches.some(({ p }) => (branchHeadway(p, period) ?? Infinity) > maxHeadway)) continue;

      const ref = branches[0].p;
      const stopBranches = new Map<string, Array<{ p: ShapeProperties }>>();
      for (const branch of branches) {
        branch.p.stopOrder!.forEach(stopId => {
          const list = stopBranches.get(stopId) ?? [];
          list.push({ p: branch.p });
          stopBranches.set(stopId, list);
        });
      }
      const commonStops = ref.stopOrder!.filter(stopId => (stopBranches.get(stopId)?.length ?? 0) >= 2);
      if (commonStops.length < 2) continue;

      const branchCadence = branches
        .map(({ p }) => branchHeadway(p, period))
        .filter((v): v is number => v != null);
      const ranges = findQualifyingStopRanges(commonStops, () => combinedHeadway(branchCadence), maxHeadway);
      if (ranges.length === 0) continue;

      for (const branch of branches) {
        const branchRanges: Array<[number, number]> = [];
        for (const [from, to] of ranges) {
          // Terminal loops can list the same first two shared stops in opposite order
          // (MARTA 121 does this at Kensington). Use the extrema of the shared stops on
          // each branch instead of assuming every branch has the reference order.
          const rangeStopIds = new Set(commonStops.slice(from, to + 1));
          const indices = branch.p.stopOrder!
            .map((stopId, index) => rangeStopIds.has(stopId) ? index : -1)
            .filter(index => index >= 0);
          if (indices.length >= 2) {
            branchRanges.push([Math.min(...indices), Math.max(...indices)]);
          }
        }
        if (branchRanges.length > 0 && addClippedSegments(branch.feature, branch.p, slug, branchRanges, maxHeadway, segments, colorMode, true)) {
          markPartial(branch.p, slug);
        }
      }
    }
  }

  // CIV-82: failing routes may draw only their passing shared stretches. They are deliberately
  // not partial matches: the route's own line stays filtered out and it still counts as failing.
  const sharedStretchStart = segments.length;
  for (const [slug, fc] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
    addFailingRouteSharedStretches(slug, fc.features, (allLayers[slug] ?? fc).features, period, maxHeadway, colorMode, segments);
  }
  const sharedStretchKeys = new Map<string, SharedStretchRouteKey>();
  for (const { properties: sp } of segments.slice(sharedStretchStart)) {
    const key: SharedStretchRouteKey = {
      agencySlug: sp.agencySlug,
      routeId: sp.routeId,
      routeBranch: sp.routeBranch,
      directionId: sp.directionId,
      headsign: sp.headsign,
      day: sp.day,
    };
    sharedStretchKeys.set(`${featureKey(key)}|${key.routeBranch ?? ''}`, key);
  }
  sharedStretchRoutes.push(...sharedStretchKeys.values());

  partialMatches.push(...partialKeys.values());
  return { segments, partialMatches, sharedStretchRoutes };
}

/**
 * The selected route's shared-stretch-only features (#850). Selecting a route draws its full
 * geometry from the base route layer, whose filter drops routes that fail the frequency filter,
 * so a route visible only through its CIV-82 shared stretch drew nothing when selected and its
 * branch rows had nothing to highlight. Only the selected route is added back; unselected
 * failing routes still show just their passing stretches.
 */
export function selectedSharedStretchRoutes(
  keys: readonly SharedStretchRouteKey[],
  selectedRoute: string | null | undefined,
): FrequencySegmentRouteKey[] {
  if (!selectedRoute || keys.length === 0) return [];
  const { agencySlug, routeId, routeBranch } = splitRouteKey(selectedRoute);
  return keys.filter(k => k.agencySlug === agencySlug
    && k.routeId === routeId
    && (routeBranch === undefined || (k.routeBranch ?? '') === routeBranch));
}

/** MapLibre filter expression matching exactly the partial-match route features (direction + headsign + day scoped). */
export function buildPartialMatchFilterExpression(keys: FrequencySegmentRouteKey[]): any {
  if (keys.length === 0) return false;
  return ['any', ...keys.map(k => ['all',
    ['==', ['get', 'agencySlug'], k.agencySlug],
    ['==', ['get', 'routeId'], k.routeId],
    ['==', ['get', 'directionId'], k.directionId],
    ['==', ['coalesce', ['get', 'headsign'], ''], k.headsign ?? ''],
    ['==', ['coalesce', ['get', 'day'], ''], k.day ?? ''],
  ])];
}

/**
 * routes-layer's own tileFilter excludes a route whose worst-direction headway fails the active
 * frequency filter -- by design (#314/#315), same reasoning as passesRouteFilter/filteredLayers.
 * Partial matches are now limited to routes that already pass that route-level check, so pull
 * those specific features back into the layer's filter only to keep their dimmed remainder
 * available, or the
 * "dimmed remainder" line-opacity case expression has nothing to apply to (the feature was never
 * in the layer to begin with) and hovering/selecting one -- which needs the base feature present
 * to highlight -- shows nothing instead of the expected full-route highlight.
 */
export function broadenFilterForPartialMatches(baseFilter: any, partialMatches: FrequencySegmentRouteKey[]): any {
  if (partialMatches.length === 0) return baseFilter;
  return ['any', baseFilter, buildPartialMatchFilterExpression(partialMatches)];
}
