import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import type { PeriodKey } from '../../shared/config';
import { clipBetweenStopIndices, clipLinestring } from '../apps/corridor-geometry';
import { headwayToTierColor, type ColorVisionMode } from './colors';
import { featurePassesHeadwayFilter, routeFilterHeadway } from '../../shared/routeHeadwayFilter';
import { PERIOD_KEYS } from '../../shared/config';
import {
  buildSharedStopIndex,
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
export function sharedStopFilterView(index: SharedStopIndex, p: ShapeProperties, stopId: string): Record<string, unknown> {
  const pooled = (metric: Parameters<typeof getPooledStop>[3]) => getPooledStop(index, p, stopId, metric);
  const headwayByPeriod: Record<string, number | null> = {};
  const periodCoverageHeadway: Record<string, number | null> = {};
  const headwayByPeriodSustained: Record<string, boolean> = {};
  for (const pk of PERIOD_KEYS) {
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

/**
 * Shared stretches of a route that FAILS the active filter (CIV-82): a route may show the
 * stretches that themselves pass; it never makes the whole route pass. A stop qualifies when its
 * pooled-or-own values pass the shared filter AND the matching stop of the opposite direction
 * (pairOppositeStop over that direction's shared-stretch stops) passes too, judged the same way
 * on the best opposite feature. Features without pooled data (sharedStretches) give nothing.
 * Returns, per failing feature, its qualifying stopOrder ranges (2+ stops) and the worst filter
 * value per qualifying stop (for the tier colour).
 */
export function failingRouteSharedRanges(
  routeFeatures: readonly GeoJSON.Feature[],
  allFeatures: readonly GeoJSON.Feature[],
  period: TimePeriod,
  maxHeadway: number,
): Array<{ feature: GeoJSON.Feature; ranges: Array<[number, number]>; values: Map<number, number> }> {
  const out: Array<{ feature: GeoJSON.Feature; ranges: Array<[number, number]>; values: Map<number, number> }> = [];
  if (maxHeadway === Infinity || !routeFeatures.some(f => (f.properties as any)?.sharedStretches)) return out;
  const index = buildSharedStopIndex(allFeatures);
  const coords = new Map<string, StopPoint>();
  for (const f of allFeatures) {
    const p = f.properties as any;
    if (f.geometry?.type === 'Point' && p?.stopId != null) {
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      coords.set(String(p.stopId), { lat, lon });
    }
  }
  const lines = allFeatures
    .filter(f => f.geometry?.type === 'LineString')
    .map(f => f.properties as unknown as ShapeProperties);
  const stopPasses = (p: ShapeProperties, stopId: string) => {
    const view = sharedStopFilterView(index, p, stopId);
    return { passes: featurePassesHeadwayFilter(view, period, maxHeadway), value: routeFilterHeadway(view, period) };
  };

  for (const f of routeFeatures) {
    if (f.geometry?.type !== 'LineString') continue;
    const p = f.properties as unknown as ShapeProperties & { sharedStretches?: Array<{ from: number; to: number }> };
    if (!p.sharedStretches?.length || !p.stopOrder || !p.stopPositions) continue;
    if (p.stopPositions.length !== p.stopOrder.length) continue;
    if (featurePassesHeadwayFilter(p, period, maxHeadway)) continue; // passing routes: handled above
    const opposite = lines.filter(q => q.routeId === p.routeId && (q.day ?? null) === (p.day ?? null)
      && Number(q.directionId) !== Number(p.directionId) && (q.stopOrder?.length ?? 0) > 0);
    const oppositeStops = oppositeSharedStops(lines, p);
    const values = new Map<number, number>();
    const onStretch = (i: number) => p.sharedStretches!.some(st => i >= st.from && i <= st.to);
    const qualifies = (i: number): boolean => {
      if (!onStretch(i)) return false;
      const stopId = p.stopOrder![i];
      const own = stopPasses(p, stopId);
      if (!own.passes) return false;
      // Every direction must pass at the matching stop.
      const o = pairOppositeStop(stopId, oppositeStops, coords);
      if (o == null) return false;
      const other = opposite
        .filter(q => q.stopOrder?.includes(o))
        .map(q => stopPasses(q, o))
        .filter(r => r.passes);
      if (other.length === 0) return false;
      values.set(i, Math.max(own.value ?? 0, Math.min(...other.map(r => r.value ?? 0))));
      return true;
    };
    const ranges = findQualifyingStopRanges(p.stopOrder.map((_, i) => String(i)), i => (qualifies(Number(i)) ? 0 : null), 0);
    if (ranges.length > 0) out.push({ feature: f, ranges, values });
  }
  return out;
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
  if (maxHeadway === Infinity) return { segments, partialMatches };

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
  for (const [slug, fc] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
    addFailingRouteSharedStretches(slug, fc.features, (allLayers[slug] ?? fc).features, period, maxHeadway, colorMode, segments);
  }

  partialMatches.push(...partialKeys.values());
  return { segments, partialMatches };
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
