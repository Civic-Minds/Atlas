import type { GeoJSON } from 'geojson';
import type { ShapeProperties } from '../hooks/useAgencyData';

/**
 * The canonical route record used by frontend features.
 *
 * This is deliberately richer than any one UI row. Callers should project it
 * into the fields they need instead of reading raw GeoJSON independently.
 */
export interface RouteFacts {
  key: string;
  agencySlug: string;
  agencyName: string;
  routeId: string;
  shortName: string;
  longName: string | null;
  directionId: number;
  headsign: string | null;
  routeType?: number;
  headway: number | null;
  headwayByPeriod?: ShapeProperties['headwayByPeriod'];
  headwayByHour?: ShapeProperties['headwayByHour'];
  tier: string | null;
}

export function buildRouteFacts(p: ShapeProperties, agencySlug?: string): RouteFacts {
  const resolvedAgencySlug = agencySlug ?? (p as ShapeProperties & { agencySlug?: string }).agencySlug ?? p.agencyName ?? '';
  const routeId = p.routeId;

  return {
    key: `${resolvedAgencySlug}::${routeId}`,
    agencySlug: resolvedAgencySlug,
    agencyName: p.agencyName || resolvedAgencySlug,
    routeId,
    shortName: p.routeShortName || routeId,
    longName: p.routeLongName || null,
    directionId: p.directionId ?? 0,
    headsign: p.headsign ?? null,
    routeType: (p as ShapeProperties & { routeType?: number }).routeType,
    headway: p.headway ?? null,
    headwayByPeriod: p.headwayByPeriod,
    headwayByHour: p.headwayByHour,
    tier: p.tier ?? null,
  };
}

export function routeFactsFromFeature(feature: GeoJSON.Feature, agencySlug?: string): RouteFacts | null {
  const properties = feature.properties as ShapeProperties | null;
  if (!properties?.routeId) return null;
  return buildRouteFacts(properties, agencySlug);
}
