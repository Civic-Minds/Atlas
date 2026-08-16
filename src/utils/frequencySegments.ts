import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import type { PeriodKey } from '../../shared/config';
import { clipBetweenStopIndices, clipLinestring } from '../apps/corridor-geometry';
import { headwayToTierColor } from './colors';
import { effectiveRouteHeadway } from './effectiveHeadway';

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
        color: headwayToTierColor(maxHeadway),
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
 * Partial-segment rendering is only allowed after the route itself passes the same
 * route-level frequency metric as the main filter. Otherwise one direction with a
 * qualifying stretch can pull an otherwise excluded route back onto the map.
 */
function routePassesFrequencyFilter(p: ShapeProperties, period: TimePeriod, maxHeadway: number): boolean {
  const routeHeadway = effectiveRouteHeadway(p, period);
  return routeHeadway != null && routeHeadway <= maxHeadway;
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
            color: headwayToTierColor(repHw),
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
      const branches = group
        .map(feature => ({ feature, p: feature.properties as unknown as ShapeProperties }))
        .filter(({ p }) => p.tier !== 'span' && p.tier !== 'infrequent')
        .filter(({ p }) => !/drop[- ]?offs?\s+only/i.test(p.headsign ?? ''));
      const distinctHeadsigns = new Set(branches.map(({ p }) => p.headsign ?? ''));
      if (branches.length < 2 || distinctHeadsigns.size < 2) continue;
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
        if (branchRanges.length > 0 && addClippedSegments(branch.feature, branch.p, slug, branchRanges, maxHeadway, segments, true)) {
          markPartial(branch.p, slug);
        }
      }
    }
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
