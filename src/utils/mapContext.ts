import type { GeoJSON } from 'geojson';
import type { Agency } from '../App';
import type { DayType } from '../../shared/dayTypes';
import type { ViewportBounds } from '../hooks/useIntervalStats';
import { buildRouteKey } from './routeKey';

export interface MapContextRoute {
  key: string;
  agencySlug: string;
  agencyName: string;
  shortName: string;
  longName: string | null;
}

export interface MapContextAgency {
  slug: string;
  name: string;
  routeCount: number;
  routes: MapContextRoute[];
}

export function isMapContextOutsideClick(panel: Node | null, target: EventTarget | null): boolean {
  return !(panel && target instanceof Node && panel.contains(target));
}

type MapContextFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

function buildMapContextAgencies(
  agencies: Agency[],
  routesByAgency: Map<string, Map<string, MapContextRoute>>,
): MapContextAgency[] {
  return [...routesByAgency.entries()]
    .map(([slug, routes]) => ({
      slug,
      name: agencies.find(agency => agency.slug === slug)?.name ?? slug,
      routeCount: routes.size,
      routes: [...routes.values()].sort((a, b) =>
        a.shortName.localeCompare(b.shortName, undefined, { numeric: true, sensitivity: 'base' })
        || (a.longName ?? '').localeCompare(b.longName ?? '', undefined, { sensitivity: 'base' })),
    }))
    .sort((a, b) => b.routeCount - a.routeCount || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function addMapContextFeature(
  agencies: Agency[],
  routesByAgency: Map<string, Map<string, MapContextRoute>>,
  slug: string,
  feature: MapContextFeature,
): void {
  const properties = feature.properties as {
    routeId?: string;
    routeBranch?: string | null;
    routeShortName?: string;
    routeLongName?: string | null;
  } | null;
  if (!properties?.routeId) return;
  const agencyName = agencies.find(agency => agency.slug === slug)?.name ?? slug;
  const routes = routesByAgency.get(slug) ?? new Map<string, MapContextRoute>();
  const key = buildRouteKey(slug, properties.routeId, properties.routeBranch);
  if (!routes.has(key)) {
    routes.set(key, {
      key,
      agencySlug: slug,
      agencyName,
      shortName: properties.routeShortName ?? properties.routeId,
      longName: properties.routeLongName ?? null,
    });
  }
  routesByAgency.set(slug, routes);
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

  const routesByAgency = new Map<string, Map<string, MapContextRoute>>();
  for (const [slug, collection] of Object.entries(layers)) {
    if (slug.endsWith('-corridors')) continue;
    for (const feature of collection.features) {
      const properties = feature.properties as {
        routeId?: string;
        routeBranch?: string | null;
        routeShortName?: string;
        routeLongName?: string | null;
        day?: DayType;
      } | null;
      if (!properties?.routeId || (properties.day !== undefined && properties.day !== day)) continue;
      if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') continue;
      if (!featureIntersectsBounds(feature, bounds)) continue;
      addMapContextFeature(agencies, routesByAgency, slug, feature as MapContextFeature);
    }
  }

  return buildMapContextAgencies(agencies, routesByAgency);
}

/** Build the same context list from MapLibre's already-filtered rendered route features. */
export function getMapContextAgenciesFromFeatures(
  agencies: Agency[],
  features: GeoJSON.Feature[],
): MapContextAgency[] {
  const routesByAgency = new Map<string, Map<string, MapContextRoute>>();
  for (const feature of features) {
    const properties = feature.properties as { agencySlug?: string; routeId?: string } | null;
    if (!properties?.agencySlug || !properties.routeId) continue;
    if (feature.geometry.type !== 'LineString' && feature.geometry.type !== 'MultiLineString') continue;
    addMapContextFeature(agencies, routesByAgency, properties.agencySlug, feature as MapContextFeature);
  }
  return buildMapContextAgencies(agencies, routesByAgency);
}
