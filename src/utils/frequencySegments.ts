import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import type { PeriodKey } from '../../shared/config';
import { clipBetweenStopIndices, clipLinestring } from '../apps/corridor-geometry';
import { headwayToTierColor } from './colors';

/** Identifies one route feature for MapLibre filter matching. */
export interface FrequencySegmentRouteKey {
  agencySlug: string;
  routeId: string;
  routeBranch?: string | null;
  directionId: number;
  headsign: string | null;
  day: string | null;
}

export interface FrequencySegmentOverlay {
  /** Bright GeoJSON lines for route stretches that meet the active threshold. */
  segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[];
  /** Base route features that need to be dimmed because only part qualifies. */
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

function findQualifyingStopRanges(
  stopOrder: readonly string[],
  headwayAt: (stopId: string) => number | null | undefined,
  maxHeadway: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let start: number | null = null;
  for (let i = 0; i < stopOrder.length; i++) {
    const qualifies = headwayAt(stopOrder[i]) != null && headwayAt(stopOrder[i])! <= maxHeadway;
    if (qualifies) {
      if (start == null) start = i;
    } else if (start != null) {
      if (i - start >= 1) ranges.push([start, i - 1]);
      start = null;
    }
  }
  if (start != null && stopOrder.length - start >= 2) ranges.push([start, stopOrder.length - 1]);
  return ranges;
}

function stopHeadwayAt(p: ShapeProperties, period: TimePeriod, stopId: string): number | null {
  if (period !== 'all') return p.stopPeriodHeadways?.[stopId]?.[period as PeriodKey] ?? null;
  return p.stopHeadways?.[stopId] ?? null;
}

function branchHeadway(p: ShapeProperties, period: TimePeriod): number | null {
  if (period !== 'all') return p.headwayByPeriod?.[period as PeriodKey] ?? null;
  return p.headway;
}

function combinedHeadway(values: number[]): number | null {
  const valid = values.filter(v => Number.isFinite(v) && v > 0);
  if (valid.length < 2) return null;
  return Math.max(1, Math.round(1 / valid.reduce((sum, value) => sum + 1 / value, 0)));
}

function routeKey(p: ShapeProperties, slug: string): FrequencySegmentRouteKey {
  return {
    agencySlug: p.agencySlug ?? slug,
    routeId: p.routeId,
    routeBranch: p.routeBranch ?? null,
    directionId: p.directionId,
    headsign: p.headsign ?? null,
    day: p.day ?? null,
  };
}

function featureKey(k: FrequencySegmentRouteKey): string {
  return [k.agencySlug, k.routeId, k.routeBranch ?? '', k.directionId, k.headsign ?? '', k.day ?? ''].join('|');
}

function addClippedSegments(
  feature: GeoJSON.Feature,
  p: ShapeProperties,
  slug: string,
  ranges: Array<[number, number]>,
  maxHeadway: number,
  segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[] ,
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
        routeBranch: p.routeBranch ?? null,
        directionId: p.directionId,
        headsign: p.headsign ?? null,
        day: p.day ?? null,
      },
    });
    added = true;
  }
  return added;
}

function groupKey(p: ShapeProperties, slug: string): string {
  return [slug, p.routeId, p.routeBranch ?? '', p.directionId, p.day ?? ''].join('|');
}

/** Find route-local and shared-core stretches that meet the active filter. */
export function computeFrequencySegmentOverlay(
  layers: AgencyLayers,
  period: TimePeriod,
  maxHeadway: number,
): FrequencySegmentOverlay {
  const segments: GeoJSON.Feature<GeoJSON.LineString, FrequencySegmentProperties>[] = [];
  const partialMatches: FrequencySegmentRouteKey[] = [];
  if (maxHeadway === Infinity) return { segments, partialMatches };

  const partialKeys = new Set<string>();
  const markPartial = (p: ShapeProperties, slug: string) => {
    const key = routeKey(p, slug);
    partialKeys.add(featureKey(key));
  };

  for (const [slug, fc] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
    const groups = new Map<string, GeoJSON.Feature[]>();
    for (const feature of fc.features) {
      if (feature.geometry.type !== 'LineString') continue;
      const p = feature.properties as unknown as ShapeProperties;
      if (!p.stopOrder || !p.stopPositions || p.stopOrder.length < 2 || p.stopPositions.length !== p.stopOrder.length) continue;
      const key = groupKey(p, slug);
      const group = groups.get(key) ?? [];
      group.push(feature);
      groups.set(key, group);
    }

    for (const feature of fc.features) {
      if (feature.geometry.type !== 'LineString') continue;
      const p = feature.properties as unknown as ShapeProperties;
      if (!p.stopOrder || !p.stopPositions || p.stopOrder.length < 2 || p.stopPositions.length !== p.stopOrder.length) continue;
      const ranges = findQualifyingStopRanges(p.stopOrder, id => stopHeadwayAt(p, period, id), maxHeadway);
      const wholeRoute = ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] === p.stopOrder.length - 1;
      if (ranges.length > 0 && !wholeRoute && addClippedSegments(feature, p, slug, ranges, maxHeadway, segments)) {
        markPartial(p, slug);
      }
    }

    // A shared core can meet the filter even when every individual branch fails it.
    // Combine branch cadences at common stops, then clip each branch to the contiguous run.
    for (const group of groups.values()) {
      const branches = group
        .map(feature => ({ feature, p: feature.properties as unknown as ShapeProperties }))
        .filter(({ p }) => p.tier !== 'span' && p.tier !== 'infrequent' && p.stopOrder && p.stopPositions)
        .filter(({ p }) => !/drop[- ]?offs?\s+only/i.test(p.headsign ?? ''));
      const distinctHeadsigns = new Set(branches.map(({ p }) => p.headsign ?? ''));
      if (branches.length < 2 || distinctHeadsigns.size < 2) continue;
      if (!branches.some(({ p }) => (branchHeadway(p, period) ?? Infinity) > maxHeadway)) continue;

      const ref = branches[0].p;
      const stopBranches = new Map<string, Array<{ feature: GeoJSON.Feature; p: ShapeProperties; index: number }>>();
      for (const branch of branches) {
        branch.p.stopOrder!.forEach((stopId, index) => {
          const list = stopBranches.get(stopId) ?? [];
          list.push({ ...branch, index });
          stopBranches.set(stopId, list);
        });
      }
      const commonStops = ref.stopOrder!.filter(stopId => (stopBranches.get(stopId)?.length ?? 0) >= 2);
      if (commonStops.length < 2) continue;
      // Shared-core cadence must use the branch cadence shown in the route card and used by
      // the active route filter. Stop-level values are noisy terminal/stop observations (for
      // example, MARTA 121 reports 32/33/30 at different shared stops even though both branches
      // are displayed as every 30); using them here incorrectly chops one continuous core into
      // fragments.
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

  for (const [agencySlug, fc] of Object.entries(layers)) {
    for (const feature of fc.features) {
      const p = feature.properties as unknown as ShapeProperties;
      if (p.routeId) {
        const key = featureKey(routeKey(p, agencySlug));
        if (partialKeys.has(key)) partialMatches.push(routeKey(p, agencySlug));
      }
    }
  }
  return { segments, partialMatches };
}

/** Match exactly the route features that have a qualifying partial stretch. */
export function buildPartialMatchFilterExpression(keys: FrequencySegmentRouteKey[]): any {
  if (keys.length === 0) return false;
  return ['any', ...keys.map(k => ['all',
    ['==', ['get', 'agencySlug'], k.agencySlug],
    ['==', ['get', 'routeId'], k.routeId],
    ['==', ['get', 'directionId'], k.directionId],
    ['==', ['coalesce', ['get', 'routeBranch'], ''], k.routeBranch ?? ''],
    ['==', ['coalesce', ['get', 'headsign'], ''], k.headsign ?? ''],
    ['==', ['coalesce', ['get', 'day'], ''], k.day ?? ''],
  ])];
}

/** Exclude the full route feature so only its qualifying GeoJSON segment is rendered. */
export function excludePartialMatches(baseFilter: any, partialMatches: FrequencySegmentRouteKey[]): any {
  if (partialMatches.length === 0) return baseFilter;
  return ['all', baseFilter, ['!', buildPartialMatchFilterExpression(partialMatches)]];
}
