import type { MapGeoJSONFeature, Map as MaplibreMap, PointLike } from 'maplibre-gl';

/**
 * What a click on the map picks, in order (CIV-1011 #13): a stop, then an on-demand zone or its stop
 * point, then a route line. The first kind with a feature under the pointer wins, so a zone never takes
 * a click meant for a stop (#1071) and a route crossing a zone never takes a click inside the zone (#1073).
 * The click handler and the pointer cursor both read this list, so the cursor shows exactly where a
 * click does something. (Live's vehicles are picked on their own deck.gl layer before any of these.)
 */
export const MAP_HIT_PRIORITY = [
  { kind: 'stop', layers: ['stops-layer'], tolerancePx: 0 },
  { kind: 'serviceArea', layers: ['on-demand-service-area-fill', 'on-demand-service-area-line', 'on-demand-stop-points'], tolerancePx: 0 },
  {
    kind: 'route',
    layers: [
      'overview-routes-hit-layer', 'routes-hit-layer', 'local-routes-hit-layer', 'night-service-routes-hit-layer',
      'frequent-service-routes-hit-layer', 'frequency-qualifying-segments-hit-layer',
    ],
    // Route lines are thin, so they answer within 12 px of the pointer.
    tolerancePx: 12,
  },
] as const;

export type MapHitKind = typeof MAP_HIT_PRIORITY[number]['kind'];

export interface MapHit {
  kind: MapHitKind;
  features: MapGeoJSONFeature[];
}

type HitMap = Pick<MaplibreMap, 'getLayer' | 'queryRenderedFeatures'>;

/** The highest-priority kind with a feature under the point, and its features; null over empty map. */
export function topMapHit(map: HitMap, point: { x: number; y: number }): MapHit | null {
  for (const { kind, layers, tolerancePx } of MAP_HIT_PRIORITY) {
    const present = layers.filter(id => map.getLayer(id));
    if (present.length === 0) continue;
    const where: PointLike | [PointLike, PointLike] = tolerancePx > 0
      ? [[point.x - tolerancePx, point.y - tolerancePx], [point.x + tolerancePx, point.y + tolerancePx]]
      : [point.x, point.y];
    const features = map.queryRenderedFeatures(where, { layers: present });
    if (features.length > 0) return { kind, features };
  }
  return null;
}
