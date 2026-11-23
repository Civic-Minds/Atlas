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

export interface MapHit<K extends string = MapHitKind> {
  kind: K;
  features: MapGeoJSONFeature[];
}

/** One kind of thing a click can pick, its layers and how far from the pointer it answers. */
export interface MapHitRule<K extends string = string> { kind: K; layers: readonly string[]; tolerancePx: number }

const toleranceOf = (kind: MapHitKind) => MAP_HIT_PRIORITY.find(r => r.kind === kind)!.tolerancePx;

/**
 * CIV-2189 (#1748 follow-up; Ryan: "The Studio map has different basic behaviours too and I don't know why"): a page's
 * drawing on the map (PageMapLayer, Studio) picks by the main map's rule: stops first and only under the pointer, then
 * its lines within the main map's route-line distance. Its segments are route lines, so they take that distance too.
 */
export function pageMapHitPriority(layerId: (name: string) => string): MapHitRule<'stop' | 'segment' | 'line'>[] {
  return [
    { kind: 'stop', layers: [layerId('stp')], tolerancePx: toleranceOf('stop') },
    { kind: 'segment', layers: [layerId('seg')], tolerancePx: toleranceOf('route') },
    { kind: 'line', layers: [layerId('line'), layerId('line-dash')], tolerancePx: toleranceOf('route') },
  ];
}

type HitMap = Pick<MaplibreMap, 'getLayer' | 'queryRenderedFeatures'>;

/**
 * The highest-priority kind with a feature under the point, and its features; null over empty map. The main map's
 * list by default; a page's drawing passes its own (pageMapHitPriority), read by the same rule.
 */
export function topMapHit<K extends string = MapHitKind>(
  map: HitMap,
  point: { x: number; y: number },
  rules: readonly MapHitRule<K>[] = MAP_HIT_PRIORITY as unknown as readonly MapHitRule<K>[],
): MapHit<K> | null {
  for (const { kind, layers, tolerancePx } of rules) {
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
