import type * as maplibregl from 'maplibre-gl';
import { fitTargetForPoints } from '../../../utils/routeFitTarget';
import type { LonLat } from '../../../../shared/routeGeometry';

/** Which side of the map the card sits on, on wide screens. */
export type CardSide = 'left' | 'right';

/**
 * Camera padding that keeps a route clear of the card: beside it on wide screens, above the
 * bottom sheet on phones. One place for every "zoom to this route or stretch" camera move.
 */
export function routeFramePadding(map: maplibregl.Map, side: CardSide = 'left'): maplibregl.PaddingOptions {
  const { clientWidth, clientHeight } = map.getContainer();
  if (clientWidth < 640) return { top: 60, bottom: Math.round(clientHeight * 0.45), left: 30, right: 30 };
  return side === 'left'
    ? { top: 80, bottom: 80, left: 320, right: 80 }
    : { top: 80, bottom: 80, left: 80, right: 280 };
}

/** Fit the camera to a route's (or stretch's) coordinates, or fly to it when it's a single point. */
export function frameRoute(
  map: maplibregl.Map,
  points: ReadonlyArray<LonLat>,
  { side = 'left', maxZoom = 14 }: { side?: CardSide; maxZoom?: number } = {},
): boolean {
  const target = fitTargetForPoints(points);
  if (!target) return false;
  const padding = routeFramePadding(map, side);
  if (target.kind === 'bounds') map.fitBounds(target.bounds, { padding, maxZoom });
  else map.flyTo({ center: target.center, zoom: Math.max(map.getZoom(), maxZoom), padding, duration: 900 });
  return true;
}
