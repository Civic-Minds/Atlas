import type * as maplibregl from 'maplibre-gl';
import { fitTargetForPoints } from '../../../utils/routeFitTarget';
import type { LonLat } from '../../../../shared/routeGeometry';
import { FEATURES } from '../../../../shared/config';

/** Which side of the map the card sits on, on wide screens. */
export type CardSide = 'left' | 'right';

/**
 * Camera padding that keeps a route clear of the card: beside it on wide screens, above the
 * bottom sheet on phones. One place for every "zoom to this route or stretch" camera move.
 */
export function routeFramePadding(map: maplibregl.Map, side: CardSide = 'left', { phoneSheet = false }: { phoneSheet?: boolean } = {}): maplibregl.PaddingOptions {
  const { clientWidth, clientHeight } = map.getContainer();
  // Live's card is a bottom sheet on phones; the main map and History keep their framing.
  if (phoneSheet && clientWidth < 640) return { top: 60, bottom: Math.round(clientHeight * 0.45), left: 30, right: 30 };
  return side === 'left'
    ? { top: 80, bottom: 80, left: 320, right: 80 }
    : { top: 80, bottom: 80, left: 80, right: 280 };
}

/**
 * Padding for the main map's route selection. Where the route card is a phone bottom sheet
 * (FEATURES.mobileRouteSheet), frame above the sheet: the side-card padding (400px of left+right)
 * leaves a phone map almost no width, so the fit zooms out to a continent.
 */
export function selectionFramePadding(map: maplibregl.Map, phoneSheet: boolean = FEATURES.mobileRouteSheet): maplibregl.PaddingOptions {
  return routeFramePadding(map, 'left', { phoneSheet });
}

/** Fit the camera to a route's (or stretch's) coordinates, or fly to it when it's a single point. */
export function frameRoute(
  map: maplibregl.Map,
  points: ReadonlyArray<LonLat>,
  { side = 'left', maxZoom = 14, phoneSheet = false, padding: customPadding, duration }: {
    side?: CardSide; maxZoom?: number; phoneSheet?: boolean;
    /** Replaces the card-based padding (for maps whose card is not beside them). */
    padding?: maplibregl.PaddingOptions;
    /** Animation length in ms; 0 jumps. Left out, bounds use the map's default and a single point flies for 900. */
    duration?: number;
  } = {},
): boolean {
  const target = fitTargetForPoints(points);
  if (!target) return false;
  const padding = customPadding ?? routeFramePadding(map, side, { phoneSheet });
  if (target.kind === 'bounds') map.fitBounds(target.bounds, { padding, maxZoom, ...(duration !== undefined && { duration }) });
  else map.flyTo({ center: target.center, zoom: Math.max(map.getZoom(), maxZoom), padding, duration: duration ?? 900 });
  return true;
}
