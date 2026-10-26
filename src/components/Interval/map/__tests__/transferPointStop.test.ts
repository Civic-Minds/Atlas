import { describe, expect, it } from 'vitest';
import { transferPointStop } from '../transferPointStop';

// #1071, Hamilton Trans-Cab "Bell Manor Loop": the transfer point sits 19-25 m from three HSR stops.
const bellManor = { serviceType: 'on-demand-transfer-point', agencySlug: 'hamilton', coordinates: [-79.743016, 43.232972] as [number, number] };
const stops = [
  { agencySlug: 'hamilton', stopId: '1042', lon: -79.744993, lat: 43.23334 }, // At 2772 Barton, 150 m away
  { agencySlug: 'hamilton', stopId: '1048', lon: -79.742792, lat: 43.232886 }, // Bell Manor Loop Platform 2, 19 m
  { agencySlug: 'hamilton', stopId: '356055', lon: -79.742717, lat: 43.23293 }, // Platform 1, 22 m
  { agencySlug: 'hamilton', stopId: '355288', lon: -79.743187, lat: 43.233164 }, // Barton opposite Bell Manor, 25 m
];

describe('transferPointStop (#1071)', () => {
  it('a transfer point on a fixed stop gives that stop, the nearest within 30 m', () => {
    expect(transferPointStop(bellManor, stops)?.stopId).toBe('1048');
  });
  it('leaves every other click to the on-demand card', () => {
    // An ordinary on-demand stop (myRide, Edmonton), even right on a fixed stop.
    expect(transferPointStop({ ...bellManor, serviceType: 'on-demand' }, stops)).toBeNull();
    // A transfer point with no fixed stop within 30 m.
    expect(transferPointStop(bellManor, [stops[0]])).toBeNull();
    // Another agency's stop does not count.
    expect(transferPointStop(bellManor, stops.map(s => ({ ...s, agencySlug: 'go' })))).toBeNull();
  });
});
