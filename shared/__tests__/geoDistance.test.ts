import { describe, expect, it } from 'vitest';
import { lonLatPoint, metresBetween } from '../geoDistance';
import { STOP_HUB_PROXIMITY_M } from '../../src/utils/stopHub';

// CIV-1592: the one distance between two points.
describe('metresBetween', () => {
  it('is 0 for the same point', () => {
    expect(metresBetween({ lat: 43.65, lon: -79.38 }, { lat: 43.65, lon: -79.38 })).toBe(0);
  });

  it('is great-circle metres on a 6,371 km sphere', () => {
    // One thousandth of a degree of latitude.
    expect(metresBetween({ lat: 43.65, lon: -79.38 }, { lat: 43.651, lon: -79.38 })).toBeCloseTo(111.195, 2);
    // Toronto to Montreal, about 504 km.
    expect(metresBetween({ lat: 43.6532, lon: -79.3832 }, { lat: 45.5019, lon: -73.5674 }) / 1000).toBeCloseTo(504, 0);
  });

  it('grows with separation, across the stop hub radius', () => {
    const near = metresBetween({ lat: 43.65, lon: -79.38 }, { lat: 43.6505, lon: -79.38 });
    const far = metresBetween({ lat: 43.65, lon: -79.38 }, { lat: 43.66, lon: -79.38 });
    expect(near).toBeLessThan(STOP_HUB_PROXIMITY_M);
    expect(far).toBeGreaterThan(STOP_HUB_PROXIMITY_M);
  });

  it('reads GeoJSON [lon, lat] positions the right way round', () => {
    expect(lonLatPoint([-79.38, 43.65])).toEqual({ lat: 43.65, lon: -79.38 });
  });
});
