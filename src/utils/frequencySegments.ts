import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import type { PeriodKey } from '../../shared/config';
import { clipBetweenStopIndices } from '../apps/corridor-geometry';
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

  for (const [slug, fc] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
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

      partialMatches.push({
        agencySlug: p.agencySlug ?? slug,
        routeId: p.routeId,
        directionId: p.directionId,
        headsign: p.headsign ?? null,
        day: p.day ?? null,
      });
    }
  }

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
