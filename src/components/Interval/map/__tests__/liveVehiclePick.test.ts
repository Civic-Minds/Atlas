import { describe, expect, it, vi } from 'vitest';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import { pickLiveVehicles, uniqueVehicles, LIVE_VEHICLE_PICK_RADIUS_PX } from '../liveVehiclePick';

const car = (id: string, routeShortName = '506') => ({ id, routeShortName, agencySlug: 'ttc', lat: 43.65, lon: -79.4 });

describe('CIV-332: picking Live vehicle dots under a click', () => {
  it('keeps one entry per vehicle, in pick order', () => {
    const a = car('4502'), b = car('4515', '510');
    expect(uniqueVehicles([a, b, a, null, undefined]).map(v => v.id)).toEqual(['4502', '4515']);
  });

  it('returns every vehicle dot under the click, so overlapping dots can be told apart', () => {
    const pickMultipleObjects = vi.fn(() => [{ object: car('4502') }, { object: car('4515', '510') }]);
    const overlay = { pickMultipleObjects } as unknown as MapboxOverlay;
    expect(pickLiveVehicles(overlay, { x: 10, y: 20 }).map(v => v.id)).toEqual(['4502', '4515']);
    expect(pickMultipleObjects).toHaveBeenCalledWith({ x: 10, y: 20, radius: LIVE_VEHICLE_PICK_RADIUS_PX, layerIds: ['vehicles-dots'] });
  });

  it('picks nothing when Live has no overlay or the overlay is not attached yet', () => {
    expect(pickLiveVehicles(null, { x: 0, y: 0 })).toEqual([]);
    const overlay = { pickMultipleObjects: () => { throw new Error('not attached'); } } as unknown as MapboxOverlay;
    expect(pickLiveVehicles(overlay, { x: 0, y: 0 })).toEqual([]);
  });
});
