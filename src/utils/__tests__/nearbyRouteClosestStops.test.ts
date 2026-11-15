import { describe, expect, it } from 'vitest';
import { nearbyRouteClosestStops } from '../stopHub';

const stop = (stopId: string, stopName: string, lat: number, lon: number, routeIds: string[]): GeoJSON.Feature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { stopId, stopName, routeIds },
});

// TTC Kingston Rd at Pine Ridge Dr (4220, southbound): 102 and 12 stop here; across the road (about 50 m) the
// northbound stop also has 86, which never stops at 4220. 902 is at a stop farther along.
const LAT = 43.7270;
const LON = -79.2330;
const features = [
  stop('4220', 'Kingston Rd at Pine Ridge Dr', LAT, LON, ['102', '12']),
  stop('4221', 'Kingston Rd at Pine Ridge Dr', LAT + 0.00045, LON, ['102', '12', '86']),
  stop('5000', 'Kingston Rd at McCowan Rd', LAT + 0.006, LON - 0.003, ['902', '102']),
  stop('9999', 'Far away', LAT + 0.05, LON, ['99']),
];

describe('nearbyRouteClosestStops (CIV-1345)', () => {
  it('lists a route that only uses the stop across the road, and skips the card\'s own routes and stops', () => {
    // The card (CIV-1305) is stop 4220 alone; the hub would also hold 4221.
    const nearby = nearbyRouteClosestStops(features, LAT, LON, new Set(['4220']), new Set(['102', '12']), 800);
    expect([...nearby.keys()].sort()).toEqual(['86', '902']);
    expect(nearby.get('86')!.stopName).toBe('Kingston Rd at Pine Ridge Dr');
    expect(nearby.get('86')!.dist).toBeGreaterThan(40);
    expect(nearby.get('86')!.dist).toBeLessThan(60);
    // The card's own routes are never nearby, even at another stop.
    expect(nearby.has('102')).toBe(false);
    expect(nearby.has('12')).toBe(false);
    // Beyond walking distance: left off.
    expect(nearby.has('99')).toBe(false);
  });

  it('with the whole hub as the card\'s stops and routes (before CIV-1345), 86 showed nowhere', () => {
    const nearby = nearbyRouteClosestStops(features, LAT, LON, new Set(['4220', '4221']), new Set(['102', '12', '86']), 800);
    expect(nearby.has('86')).toBe(false);
  });

  it('keeps each route\'s closest stop', () => {
    const nearby = nearbyRouteClosestStops(
      [...features, stop('4222', 'Closer stop', LAT + 0.0002, LON, ['902'])], LAT, LON, new Set(['4220']), new Set(['102', '12']), 800,
    );
    expect(nearby.get('902')!.stopName).toBe('Closer stop');
  });
});
