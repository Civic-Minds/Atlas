import { describe, expect, it } from 'vitest';
import { barDistancesFor, routeKeysForNames, tripConnectingRoutes, waitWithin, type BustangData, type BustangTrip } from '../bustangConnections';

// CIV-1353: the connections bar reads a trip's connecting routes from the built file, at the file's own distances.
const data = {
  nearbyChoices: [200, 400, 600, 800],
  routes: [['rtd-denver', '15'], ['rtd-denver', 'E'], ['mountainmetro', '39']],
} as unknown as BustangData;
const trip: BustangTrip = {
  id: 'T', routeId: 'SOUT', routeName: 'South', headsign: 'Denver',
  stops: [
    // Woodmen: 39 leaves 2 min after the bus arrives, but only from a stop 300 m away.
    { stop: 0, arrival: 370, departure: 370, after: [[2, null, 2, 2, 2]], before: [[2, null, 42, 42, 42]] },
    // Union Station: 15 leaves at once within 200 m; E in 14 min, but its stop is 500 m away.
    { stop: 1, arrival: 490, departure: 490, after: [[0, 0, 0, 0, 0], [1, null, null, 14, 14]], before: null },
  ],
};

describe('connections bar (CIV-1353)', () => {
  it('keeps the routes within the wait and the walk, on the chosen side', () => {
    expect(tripConnectingRoutes(data, trip, 'after', 200, 15)).toEqual([['rtd-denver', '15']]);
    expect(tripConnectingRoutes(data, trip, 'after', 400, 15)).toEqual([['mountainmetro', '39'], ['rtd-denver', '15']]);
    expect(tripConnectingRoutes(data, trip, 'after', 600, 15)).toEqual([['mountainmetro', '39'], ['rtd-denver', '15'], ['rtd-denver', 'E']]);
    expect(tripConnectingRoutes(data, trip, 'after', 600, 1)).toEqual([['rtd-denver', '15']]);
    // Catching the bus: only stops where riders get on count, and 39's 42 min wait is past 30.
    expect(tripConnectingRoutes(data, trip, 'before', 400, 30)).toEqual([]);
    expect(tripConnectingRoutes(data, trip, 'before', 400, 60)).toEqual([['mountainmetro', '39']]);
  });

  it('reads waits by the file\'s own distances, so a file built without 600 m has none there', () => {
    const old = { nearbyChoices: [200, 400, 800] };
    expect(waitWithin(old, [0, 1, 2, 3], 800)).toBe(3);
    expect(waitWithin(old, [0, 1, 2, 3], 600)).toBeNull();
    expect(barDistancesFor(old)).toEqual([200, 400]);
    expect(barDistancesFor(data)).toEqual([200, 400, 600]);
    expect(barDistancesFor(null)).toEqual([200, 400, 600]);
  });

  it('finds the map\'s route keys by short name, else long name', () => {
    const fc = (features: Array<Record<string, unknown>>) => ({ type: 'FeatureCollection', features: features.map(properties => ({ type: 'Feature', properties, geometry: null })) }) as unknown as GeoJSON.FeatureCollection;
    const layers = {
      'rtd-denver': fc([{ routeId: '15', routeShortName: '15' }, { routeId: '15', routeShortName: '15' }, { routeId: '101E', routeShortName: 'E' }, { routeId: 'X', routeShortName: '15L' }]),
      mountainmetro: fc([{ routeId: '3615', routeShortName: null, routeLongName: '39' }]),
    };
    expect(routeKeysForNames(layers, [['rtd-denver', '15'], ['rtd-denver', 'E'], ['mountainmetro', '39'], ['summit-stage', 'Blue']]))
      .toEqual(['mountainmetro::3615', 'rtd-denver::101E', 'rtd-denver::15']);
  });
});

describe("the bar's trip list times (CIV-1353, 11c)", () => {
  it('lists the arrival at the last stop when arriving, the departure from the first when leaving', async () => {
    const { tripListTime } = await import('../bustangConnections');
    const trip = { id: 't', routeId: 'r', routeName: 'West', headsign: null, stops: [
      { stop: 0, arrival: 600, departure: 605, after: null, before: [] },
      { stop: 1, arrival: 700, departure: 702, after: [], before: null },
    ] };
    expect(tripListTime(trip, 'after')).toBe(700);
    expect(tripListTime(trip, 'before')).toBe(605);
  });
});

describe('connections bar flag (CIV-1353: local only)', () => {
  it('is on only on the Vite dev server, never on a beta or public build', async () => {
    const { vi } = await import('vitest');
    const flagFor = async (dev: boolean, mode: string) => {
      vi.resetModules();
      vi.stubEnv('DEV', dev);
      vi.stubEnv('VITE_ATLAS_MODE', mode);
      const on = (await import('../../../shared/config')).FEATURES.connectionsBar;
      vi.unstubAllEnvs();
      return on;
    };
    expect(await flagFor(true, 'dev')).toBe(true);
    expect(await flagFor(true, 'beta')).toBe(true);
    expect(await flagFor(false, 'beta')).toBe(false);
    expect(await flagFor(false, 'public')).toBe(false);
  });
});
