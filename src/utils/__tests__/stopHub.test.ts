import { describe, expect, it } from 'vitest';
import {
  collectStopHubSiblings,
  getDistanceMeters,
  STOP_HUB_PROXIMITY_M,
} from '../stopHub';

describe('getDistanceMeters', () => {
  it('is ~0 for the same point', () => {
    expect(getDistanceMeters(43.65, -79.38, 43.65, -79.38)).toBeLessThan(1);
  });

  it('grows with separation', () => {
    const near = getDistanceMeters(43.65, -79.38, 43.6505, -79.38);
    const far = getDistanceMeters(43.65, -79.38, 43.66, -79.38);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeLessThan(STOP_HUB_PROXIMITY_M);
    expect(far).toBeGreaterThan(STOP_HUB_PROXIMITY_M);
  });
});

describe('collectStopHubSiblings', () => {
  it('includes same-name stops under the same agency regardless of distance', () => {
    const result = collectStopHubSiblings(43.65, -79.38, 'ttc', 'Union Station', [
      { stopId: 'A', agencySlug: 'ttc', stopName: 'Union Station', lat: 43.65, lon: -79.38, routeIds: ['1'] },
      { stopId: 'B', agencySlug: 'ttc', stopName: 'Union Station', lat: 44.0, lon: -79.0, routeIds: ['2'] },
      { stopId: 'C', agencySlug: 'ttc', stopName: 'Other', lat: 44.0, lon: -79.0, routeIds: ['3'] },
    ]);
    expect(result.siblingIdsByAgency.ttc.has('A')).toBe(true);
    expect(result.siblingIdsByAgency.ttc.has('B')).toBe(true);
    expect(result.siblingIdsByAgency.ttc?.has('C')).toBeFalsy();
    expect(result.allRouteIds.has('1')).toBe(true);
    expect(result.allRouteIds.has('2')).toBe(true);
    expect(result.allRouteIds.has('3')).toBe(false);
  });

  it('includes nearby stops from any agency within 120 m', () => {
    // ~50 m north of click
    const nearLat = 43.65 + 50 / 111320;
    const result = collectStopHubSiblings(43.65, -79.38, 'ttc', 'Platform A', [
      { stopId: 'ttc1', agencySlug: 'ttc', stopName: 'Platform A', lat: 43.65, lon: -79.38, routeIds: ['504'] },
      { stopId: 'go1', agencySlug: 'go', stopName: 'Union GO', lat: nearLat, lon: -79.38, routeIds: ['LW'] },
    ]);
    expect(result.siblingIdsByAgency.ttc.has('ttc1')).toBe(true);
    expect(result.siblingIdsByAgency.go.has('go1')).toBe(true);
    expect(result.routesByAgency.go.has('LW')).toBe(true);
  });

  it('excludes far stops with different names', () => {
    const farLat = 43.65 + 500 / 111320;
    const result = collectStopHubSiblings(43.65, -79.38, 'ttc', 'Home', [
      { stopId: 'far', agencySlug: 'yrt', stopName: 'Elsewhere', lat: farLat, lon: -79.38, routeIds: ['99'] },
    ]);
    expect(result.siblingIdsByAgency.yrt).toBeUndefined();
    expect(result.allRouteIds.size).toBe(0);
  });
});
