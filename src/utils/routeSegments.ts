import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import type { AgencyLayers } from '../hooks/useAgencyData';
import { clipLinestring } from '../apps/corridor-geometry';
import { getTierColor, type ColorVisionMode } from './colors';

/**
 * Route lines drawn in segments (#690, beta only: FEATURES.segmentColours).
 *
 * The pipeline cuts each drawn line into runs of equal pooled tier (`segments` on the route
 * feature: stretches of the line as fractions of its length, graded on every trip at each stop
 * of the drawn pattern, pipeline/stopPools.ts segmentsByTier). This module turns those stretches
 * into clipped GeoJSON pieces coloured by their tier, drawn over the route's base line. The
 * pipeline places each piece from half way before its first stop to half way after its last
 * (the terminals take the stop's own position), so the colours change half way between two
 * stops rather than on a stop; a stop with no all-day value is its own limited-service piece
 * (#810). The route-level tier and headway still decide the filter; the segments only show
 * where along the line the service is better or worse.
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
  start: number;
  end: number;
  tier: string;
  headway: number | null;
}

/** The clipped coordinates of one stretch of the line, start to end as fractions of its length. */
export function clipSegmentRange(coords: number[][], start: number, end: number): number[][] | null {
  if (!(start >= 0 && end <= 1 && end > start)) return null;
  return clipLinestring(coords, start, end);
}

/** True when a selected-route key (`slug::routeId` or `slug::routeId::branch`) names this route. */
export function selectedRouteMatches(selectedRoute: string | null | undefined, agencySlug: string, routeId: string): boolean {
  if (!selectedRoute) return false;
  const [slug, id] = selectedRoute.split('::');
  return slug === agencySlug && id === routeId;
}

export function buildRouteSegmentFeatures(
  layers: Record<string, GeoJSON.FeatureCollection> | AgencyLayers | undefined,
  period: TimePeriod,
  colorMode: ColorVisionMode = 'default',
  /** Keep only lines this accepts (the selected route is built from the unfiltered layers). */
  accept?: (p: { agencySlug: string; routeId: string; day: string | null }) => boolean,
): GeoJSON.Feature<GeoJSON.LineString, RouteSegmentProperties>[] {
  if (!layers || period !== 'all') return [];
  const out: GeoJSON.Feature<GeoJSON.LineString, RouteSegmentProperties>[] = [];
  for (const [slug, collection] of Object.entries(layers)) {
    for (const feature of collection.features) {
      if (feature.geometry.type !== 'LineString') continue;
      const p = feature.properties as unknown as (ShapeProperties & { segments?: LineSegmentRange[]; agencySlug?: string }) | null;
      const segments = p?.segments;
      if (!p || !Array.isArray(segments) || segments.length === 0) continue;
      if (accept && !accept({ agencySlug: p.agencySlug ?? slug, routeId: String(p.routeId), day: p.day ?? null })) continue;
      for (const segment of segments) {
        if (!segment || typeof segment.tier !== 'string' || typeof segment.start !== 'number' || typeof segment.end !== 'number') continue;
        const coordinates = clipSegmentRange(feature.geometry.coordinates, segment.start, segment.end);
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
