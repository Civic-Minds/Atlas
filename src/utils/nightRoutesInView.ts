import { nightServiceKey, type NightServiceFrequency } from '../../shared/nightService';
import { boundingBox, lineCoordinates } from '../../shared/routeGeometry';

export interface NightServiceFeatureProperties {
  nightService?: boolean;
  nightService30?: boolean;
  nightService60?: boolean;
  nightServicePartOfRoute?: boolean;
  routeId?: string | null;
  routeShortName?: string | null;
  routeLongName?: string | null;
  routeType?: number;
  headsign?: string | null;
  agencyName?: string | null;
}

export interface MapBounds { n: number; s: number; e: number; w: number }

function featureIntersectsBounds(feature: GeoJSON.Feature, bounds: MapBounds): boolean {
  const box = boundingBox(lineCoordinates(feature.geometry));
  if (!box) return false;
  return box.maxLng >= bounds.w && box.minLng <= bounds.e && box.maxLat >= bounds.s && box.minLat <= bounds.n;
}

/**
 * The night route rows in the map view. The Night list and the map's route pill both count from this, so the
 * two always agree (#1233: TTC downtown, the pill said 32 and the list 12).
 */
export function nightRoutesInView(
  layers: Record<string, GeoJSON.FeatureCollection>,
  frequency: NightServiceFrequency,
  bounds: MapBounds | null | undefined,
): Array<{ agencySlug: string; properties: NightServiceFeatureProperties }> {
  if (!bounds) return [];
  const routes: Array<{ agencySlug: string; properties: NightServiceFeatureProperties }> = [];
  for (const [agencySlug, collection] of Object.entries(layers)) {
    for (const feature of collection.features) {
      const properties = feature.properties as NightServiceFeatureProperties | null;
      if (properties?.[nightServiceKey(frequency)] !== true && !(frequency === 60 && properties?.nightService === true)) continue;
      if (!featureIntersectsBounds(feature, bounds)) continue;
      routes.push({ agencySlug, properties: properties! });
    }
  }
  return routes;
}

/** A night route's key: one per agency, short name and long name, as the list groups its rows. */
export function nightRouteKey(agencySlug: string, route: { routeShortName?: string | null; routeLongName?: string | null }): string {
  return `${agencySlug}::${route.routeShortName ?? ''}::${route.routeLongName ?? ''}`;
}

/** How many night routes and agencies the list shows for this view. */
export function countNightRoutesInView(
  layers: Record<string, GeoJSON.FeatureCollection>,
  frequency: NightServiceFrequency,
  bounds: MapBounds | null | undefined,
): { routes: number; agencies: number } {
  const routes = new Set<string>();
  const agencies = new Set<string>();
  for (const { agencySlug, properties } of nightRoutesInView(layers, frequency, bounds)) {
    routes.add(nightRouteKey(agencySlug, properties));
    agencies.add(agencySlug);
  }
  return { routes: routes.size, agencies: agencies.size };
}
