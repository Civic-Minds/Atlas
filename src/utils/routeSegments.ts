import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import { clipLinestring } from '../apps/corridor-geometry';
import { getTierColor, type ColorVisionMode } from './colors';

/**
 * Route lines drawn in segments (#690, beta only: FEATURES.segmentColours).
 *
 * The pipeline cuts each drawn line into runs of equal pooled tier (`segments` on the route
 * feature: inclusive stop-index ranges graded on every trip at each stop, pipeline/stopPools.ts
 * segmentsByTier). This module turns those ranges into clipped GeoJSON pieces coloured by their
 * tier, drawn over the route's base line. Each piece runs from the midpoint before its first stop
 * to the midpoint after its last stop (the terminals take the line's own end), so the colours
 * change half way between two stops rather than on a stop. The route-level tier and headway still
 * decide the filter; the segments only show where along the line the service is better or worse.
 *
 * Segments are all-day readings, so pieces are built only for the all-day period: a period view
 * keeps one colour per line.
 */

export interface RouteSegmentProperties {
  color: string;
  tier: string;
  headway: number | null;
  agencySlug: string;
  routeId: string;
  directionId: number;
  headsign: string | null;
  day: string | null;
}

export interface LineSegmentRange {
  from: number;
  to: number;
  tier: string;
  headway: number | null;
}

/** The clipped coordinates of one inclusive stop-index range, midpoint to midpoint. */
export function clipSegmentRange(coords: number[][], stopPositions: number[], from: number, to: number): number[][] | null {
  if (from < 0 || to < from || to >= stopPositions.length || stopPositions.length < 2) return null;
  const tStart = from > 0 ? (stopPositions[from] + stopPositions[from - 1]) / 2 : stopPositions[from];
  const tEnd = to < stopPositions.length - 1 ? (stopPositions[to] + stopPositions[to + 1]) / 2 : stopPositions[to];
  if (tEnd <= tStart) return null;
  return clipLinestring(coords, tStart, tEnd);
}

export function buildRouteSegmentFeatures(
  layers: Record<string, GeoJSON.FeatureCollection> | AgencyLayers | undefined,
  period: TimePeriod,
  colorMode: ColorVisionMode = 'default',
): GeoJSON.Feature<GeoJSON.LineString, RouteSegmentProperties>[] {
  if (!layers || period !== 'all') return [];
  const out: GeoJSON.Feature<GeoJSON.LineString, RouteSegmentProperties>[] = [];
  for (const [slug, collection] of Object.entries(layers)) {
    for (const feature of collection.features) {
      if (feature.geometry.type !== 'LineString') continue;
      const p = feature.properties as unknown as (ShapeProperties & { segments?: LineSegmentRange[]; agencySlug?: string }) | null;
      const segments = p?.segments;
      if (!p || !Array.isArray(segments) || segments.length === 0) continue;
      const stopPositions = p.stopPositions;
      if (!Array.isArray(stopPositions) || !Array.isArray(p.stopOrder) || stopPositions.length !== p.stopOrder.length) continue;
      for (const segment of segments) {
        if (!segment || typeof segment.tier !== 'string') continue;
        const coordinates = clipSegmentRange(feature.geometry.coordinates, stopPositions, segment.from, segment.to);
        if (!coordinates || coordinates.length < 2) continue;
        out.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {
            color: getTierColor(segment.tier, colorMode),
            tier: segment.tier,
            headway: segment.headway ?? null,
            agencySlug: p.agencySlug ?? slug,
            routeId: String(p.routeId),
            directionId: Number(p.directionId),
            headsign: p.headsign ?? null,
            day: p.day ?? null,
          },
        });
      }
    }
  }
  return out;
}
