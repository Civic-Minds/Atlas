import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { LiveVehicle } from '../../../context/LiveVehiclesMapOverlay';

/** Click hit area around a Live vehicle dot, in screen pixels, whatever the zoom. */
export const LIVE_VEHICLE_PICK_RADIUS_PX = 12;

/** #1813: the deck.gl layers that draw a Live vehicle (the arrow for one with a heading, else the dot); clicks and hovers pick these. */
export const LIVE_VEHICLE_LAYER_IDS = ['vehicles-arrows', 'vehicles-dots'];

/**
 * #1813 (Ryan picked option 1, "1 but maybe slightly smaller arrows?"): a vehicle's arrow, in screen pixels, a little
 * under the review mock's 16 px. The white edge behind it is this plus LIVE_VEHICLE_ARROW_EDGE_PX.
 */
export const LIVE_VEHICLE_ARROW_PX = 13;
export const LIVE_VEHICLE_ARROW_EDGE_PX = 4;

/** One entry per vehicle, in pick order (deck.gl can return the same object more than once). */
export function uniqueVehicles(objects: readonly unknown[]): LiveVehicle[] {
  const seen = new Set<string>();
  const out: LiveVehicle[] = [];
  for (const o of objects) {
    const v = o as LiveVehicle | null | undefined;
    if (!v || typeof v.id !== 'string' || seen.has(v.id)) continue;
    seen.add(v.id);
    out.push(v);
  }
  return out;
}

/**
 * Every Live vehicle dot under a map click. Shared by the Live click handler and the main map's
 * click handler, so a click on a dot opens the vehicle and never the main map's route picker.
 */
export function pickLiveVehicles(overlay: MapboxOverlay | null | undefined, point: { x: number; y: number }): LiveVehicle[] {
  if (!overlay) return [];
  try {
    const infos = overlay.pickMultipleObjects({ x: point.x, y: point.y, radius: LIVE_VEHICLE_PICK_RADIUS_PX, layerIds: LIVE_VEHICLE_LAYER_IDS });
    return uniqueVehicles(infos.map(info => info.object));
  } catch {
    // The overlay is not attached to the map yet: nothing to pick.
    return [];
  }
}
