import type * as maplibregl from 'maplibre-gl';
import { fitTargetForPoints } from '../../../utils/routeFitTarget';
import type { LonLat } from '../../../../shared/routeGeometry';
import { FEATURES } from '../../../../shared/config';

/** Which side of the map the card sits on, on wide screens. */
export type CardSide = 'left' | 'right';

/** The phone top bar's buttons sit 21px in from each side and end 51px from the top (measured at 360-402px wide). */
const PHONE_TOP_BAR_SIDE_INSET = 21;
const PHONE_TOP_BAR_BOTTOM = 51;
/** Below this map width the card is a phone card or bottom sheet, not a card beside the map. */
const PHONE_MAP_WIDTH = 640;
/** Clear space kept between a framed route and the top bar or screen edge. */
const PHONE_FRAME_MARGIN = 24;

/** A card's on-screen box, as getBoundingClientRect gives it. */
export interface CardRect { top: number; bottom: number; left: number; right: number }

/** Smallest map area kept for the framed route when a tall card fills most of a phone screen. */
const MIN_FRAME_SPAN = 120;

/**
 * Padding measured from the card itself: below (or above) a card that spans a phone screen's width, beside it on
 * wide screens, so a framed route, place or vehicle never sits under the card.
 */
function cardRectPadding(container: HTMLElement, card: CardRect, side: CardSide, phoneSheet: boolean): maplibregl.PaddingOptions {
  const { clientWidth, clientHeight } = container;
  const box = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : { top: 0, left: 0 };
  const top = card.top - box.top;
  const bottom = card.bottom - box.top;
  const left = card.left - box.left;
  const right = card.right - box.left;
  if (clientWidth < PHONE_MAP_WIDTH) {
    const inset = PHONE_TOP_BAR_SIDE_INSET + PHONE_FRAME_MARGIN;
    const topBar = PHONE_TOP_BAR_BOTTOM + PHONE_FRAME_MARGIN;
    // A bottom sheet keeps the space above it; a card at the top keeps the space below it.
    const sheet = top >= clientHeight / 2;
    const above = sheet ? topBar : Math.max(topBar, Math.round(bottom + PHONE_FRAME_MARGIN));
    const below = sheet ? Math.round(clientHeight - top + PHONE_FRAME_MARGIN) : PHONE_FRAME_MARGIN;
    const spare = clientHeight - above - below - MIN_FRAME_SPAN;
    // A card taller than the screen allows: give up space on the card's side, never the whole map.
    return sheet
      ? { top: above, bottom: spare < 0 ? Math.max(0, below + spare) : below, left: inset, right: inset }
      : { top: spare < 0 ? Math.max(0, above + spare) : above, bottom: below, left: inset, right: inset };
  }
  const base = routeFramePadding({ getContainer: () => container } as maplibregl.Map, side, { phoneSheet });
  return side === 'left'
    ? { ...base, left: Math.max(base.left ?? 0, Math.round(right + PHONE_FRAME_MARGIN)) }
    : { ...base, right: Math.max(base.right ?? 0, Math.round(clientWidth - left + PHONE_FRAME_MARGIN)) };
}

/**
 * Camera padding that keeps a route clear of the card: beside it on wide screens, above the
 * bottom sheet on phones. One place for every "zoom to this route or stretch" camera move.
 */
export function routeFramePadding(
  map: maplibregl.Map,
  side: CardSide = 'left',
  { phoneSheet = false, card }: {
    phoneSheet?: boolean;
    /** The card's on-screen box (getBoundingClientRect), when the card's real size and place are known. */
    card?: CardRect | null;
  } = {},
): maplibregl.PaddingOptions {
  const container = map.getContainer();
  const { clientWidth, clientHeight } = container;
  if (card && card.bottom > card.top && card.right > card.left) return cardRectPadding(container, card, side, phoneSheet);
  // Live's card is a bottom sheet on phones; the main map and History keep their framing.
  if (phoneSheet && clientWidth < PHONE_MAP_WIDTH) {
    const inset = PHONE_TOP_BAR_SIDE_INSET + PHONE_FRAME_MARGIN;
    return { top: PHONE_TOP_BAR_BOTTOM + PHONE_FRAME_MARGIN, bottom: Math.round(clientHeight * 0.45), left: inset, right: inset };
  }
  return side === 'left'
    ? { top: 80, bottom: 80, left: 320, right: 80 }
    : { top: 80, bottom: 80, left: 80, right: 280 };
}

/**
 * Whether the card is in its framing place: always beside the map on wide screens; on phones, only once it is the bottom
 * sheet (its top in the lower half). Entering Live with a route open, the phone card is the list at the top for a moment
 * before the sheet opens, and a fit measured then lands under the sheet (CIV-1093).
 */
export function cardInFramingPlace(map: maplibregl.Map, card: Element | null | undefined): boolean {
  const container = map.getContainer();
  if (container.clientWidth >= PHONE_MAP_WIDTH) return true;
  if (!card) return false;
  const top = card.getBoundingClientRect().top - (typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect().top : 0);
  return top >= container.clientHeight / 2;
}

/** True when the card sits beside the map (wide screens), so its width sets the framing's side padding. */
export function cardBesideMap(map: maplibregl.Map): boolean {
  return map.getContainer().clientWidth >= PHONE_MAP_WIDTH;
}

/**
 * What the route fit does for a selection: `skip` when this fit already ran, `hold` when a vehicle card is open
 * (the vehicle's own frame wins, so the route counts as framed without moving the camera), otherwise `fit`.
 * A route picked by the same click that opens a vehicle card, a route layer that loads late, or a padding change
 * would otherwise refit the whole route over the vehicle frame.
 */
export function routeFitStep(fitKey: string, fittedKey: string | null, vehicleCardOpen: boolean): 'skip' | 'hold' | 'fit' {
  if (fittedKey === fitKey) return 'skip';
  return vehicleCardOpen ? 'hold' : 'fit';
}

/** Padding that keeps a framed route, place or vehicle clear of this card element, measured where it is now. */
export function cardFramePadding(map: maplibregl.Map, card: Element | null | undefined): maplibregl.PaddingOptions {
  return routeFramePadding(map, 'left', { phoneSheet: true, card: card?.getBoundingClientRect() ?? null });
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
  { side = 'left', maxZoom = 14, minZoom, phoneSheet = false, padding: customPadding, duration }: {
    side?: CardSide; maxZoom?: number; phoneSheet?: boolean;
    /** Never lands below this zoom (a place must open close enough for its vehicles to show). */
    minZoom?: number;
    /** Replaces the card-based padding (for maps whose card is not beside them). */
    padding?: maplibregl.PaddingOptions;
    /** Animation length in ms; 0 jumps. Left out, bounds use the map's default and a single point flies for 900. */
    duration?: number;
  } = {},
): boolean {
  const target = fitTargetForPoints(points);
  if (!target) return false;
  const padding = customPadding ?? routeFramePadding(map, side, { phoneSheet });
  if (target.kind === 'bounds' && minZoom !== undefined) {
    const camera = map.cameraForBounds(target.bounds, { padding, maxZoom });
    if (!camera) return false;
    const zoom = Math.max(camera.zoom ?? 0, minZoom);
    const [[w, s], [e, n]] = target.bounds as [[number, number], [number, number]];
    map.flyTo({ center: paddedCenter([(w + e) / 2, (s + n) / 2], zoom, padding), zoom, ...(duration !== undefined && { duration }) });
  } else if (target.kind === 'bounds') map.fitBounds(target.bounds, { padding, maxZoom, ...(duration !== undefined && { duration }) });
  else {
    // The padding goes into the centre, not the camera: MapLibre keeps a flyTo's padding, and the next route fit
    // would add the card's width a second time (a route picked after a vehicle zoomed out to the region).
    const zoom = Math.max(map.getZoom(), maxZoom);
    map.flyTo({ center: paddedCenter(target.center, zoom, padding), zoom, duration: duration ?? 900 });
  }
  return true;
}

/**
 * The map centre that puts `point` in the middle of the padded area at `zoom` (Web Mercator), without passing the
 * padding to the camera, which would keep it for every later camera move.
 */
export function paddedCenter(point: LonLat, zoom: number, padding: maplibregl.PaddingOptions): [number, number] {
  const world = 512 * 2 ** zoom;
  const x = ((point[0] + 180) / 360) * world;
  const sin = Math.sin((point[1] * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  const cx = x - ((padding.left ?? 0) - (padding.right ?? 0)) / 2;
  const cy = y - ((padding.top ?? 0) - (padding.bottom ?? 0)) / 2;
  const lon = (cx / world) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * cy) / world))) * 180) / Math.PI;
  return [lon, lat];
}
