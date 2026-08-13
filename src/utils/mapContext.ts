import type { GeoJSON } from 'geojson';
import type { Agency } from '../App';
import type { DayType } from '../../shared/dayTypes';
import type { ViewportBounds } from '../hooks/useIntervalStats';

export interface MapContextAgency {
  slug: string;
  name: string;
  routeCount: number;
}

function featureIntersectsBounds(feature: GeoJSON.Feature, bounds: ViewportBounds): boolean {
  if (feature.geometry.type === 'Point') {
    const [lon, lat] = feature.geometry.coordinates;
    return lat >= bounds.s && lat <= bounds.n && lon >= bounds.w && lon <= bounds.e;
  }

  const coordinates = feature.geometry.type === 'LineString'
    ? feature.geometry.coordinates
    : feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates.flat()
      : [];
  if (coordinates.length === 0) return false;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }

  return maxLon >= bounds.w && minLon <= bounds.e && maxLat >= bounds.s && minLat <= bounds.n;
}

/** Count unique route shapes that intersect the current map viewport. */
export function getMapContextAgencies(
  agencies: Agency[],
  layers: Record<string, GeoJSON.FeatureCollection>,
  bounds: ViewportBounds | null,
  day: DayType,
): MapContextAgency[] {
  if (!bounds) return [];

  const counts = new Map<string, Set<string>>();
  for (const [slug, collection] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
    const routeIds = new Set<string>();
    for (const feature of collection.features) {
      const properties = feature.properties as { routeId?: string; day?: DayType } | null;
      if (!properties?.routeId || (properties.day !== undefined && properties.day !== day)) continue;
      if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') continue;
      if (featureIntersectsBounds(feature, bounds)) routeIds.add(properties.routeId);
    }
    if (routeIds.size > 0) counts.set(slug, routeIds);
  }

  return [...counts.entries()]
    .map(([slug, routeIds]) => ({
      slug,
      name: agencies.find(agency => agency.slug === slug)?.name ?? slug,
      routeCount: routeIds.size,
    }))
    .sort((a, b) => b.routeCount - a.routeCount || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
