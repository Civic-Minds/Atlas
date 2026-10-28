import type { Map as MaplibreMap, MapGeoJSONFeature } from 'maplibre-gl';

/**
 * Every map layer that draws a route's line (CIV-989). The "routes in view" counter, its list, Compare's route counts and
 * the map export's route details all read the drawn routes from here, so a line on the map is always counted: the
 * counter used to read three of these and missed routes drawn only by the segment layers (#1090, YRT Viva Purple).
 * Hit layers are invisible click targets and are left out.
 */
export const DRAWN_ROUTE_LAYERS = [
  'overview-routes-layer',
  'routes-layer',
  'local-routes-layer',
  'route-segments-layer',
  'selected-route-layer',
  'selected-local-route-layer',
  'selected-route-segments-layer',
  'night-service-routes-layer',
  'frequent-service-routes-layer',
  'frequency-qualifying-segments-layer',
] as const;

/** Below this line opacity a feature is not drawn (a route hidden by zoom stays in the query results at zero opacity). */
const MIN_DRAWN_OPACITY = 0.05;

/** The drawn-route layers present and visible on this map. */
export function drawnRouteLayers(map: Pick<MaplibreMap, 'getLayer' | 'getLayoutProperty'>): string[] {
  return DRAWN_ROUTE_LAYERS.filter(layer => map.getLayer(layer) && map.getLayoutProperty(layer, 'visibility') !== 'none');
}

/** The route features the map actually draws in `box` (the whole view when omitted): visible layers, visible opacity. */
export function queryDrawnRouteFeatures(
  map: Pick<MaplibreMap, 'getLayer' | 'getLayoutProperty' | 'queryRenderedFeatures'>,
  box?: Parameters<MaplibreMap['queryRenderedFeatures']>[0],
): MapGeoJSONFeature[] {
  const layers = drawnRouteLayers(map);
  if (layers.length === 0) return [];
  return map.queryRenderedFeatures(box, { layers }).filter((feature: MapGeoJSONFeature) => {
    const paint = (feature.layer as { paint?: Record<string, unknown> }).paint ?? {};
    const opacity = typeof paint['line-opacity'] === 'number' ? paint['line-opacity'] : 1;
    return opacity >= MIN_DRAWN_OPACITY;
  });
}
