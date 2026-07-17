import { describe, expect, it } from 'vitest';
import { inferLiveDirection } from '../liveDirection';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

const vehicle = (overrides: Partial<LiveVehicle> = {}): LiveVehicle => ({
  id: 'v1', routeShortName: 'blue', displayName: 'VIVA Blue', tripId: 't1',
  lat: 0, lon: 0.005, bearing: 90, speedKmh: 30, tsEpoch: null, delayMin: null,
  headsign: null, directionId: null, vehicleLabel: null, status: 'on_time', agencySlug: 'yrt',
  ...overrides,
});

const feature = (directionId: number, headsign: string, coordinates: [number, number][]): GeoJSON.Feature => ({
  type: 'Feature',
  properties: { routeShortName: 'blue', directionId, headsign },
  geometry: { type: 'LineString', coordinates },
});

describe('inferLiveDirection', () => {
  it('uses bearing to select between opposite directional shapes', () => {
    const result = inferLiveDirection(vehicle(), [
      feature(0, 'Newmarket Terminal', [[0, 0], [0.01, 0]]),
      feature(1, 'Finch GO Bus Terminal', [[0.01, 0], [0, 0]]),
    ]);
    expect(result).toEqual({ directionId: 0, headsign: 'Newmarket Terminal' });
  });

  it('returns no label when the directional match is ambiguous', () => {
    const result = inferLiveDirection(vehicle({ bearing: null }), [
      feature(0, 'Newmarket Terminal', [[0, 0], [0.01, 0]]),
      feature(1, 'Finch GO Bus Terminal', [[0.01, 0], [0, 0]]),
    ]);
    expect(result).toEqual({ directionId: null, headsign: null });
  });

  it('uses a known direction to fill a missing destination', () => {
    const result = inferLiveDirection(vehicle({ directionId: 1 }), [
      feature(0, 'Newmarket Terminal', [[0, 0], [0.01, 0]]),
      feature(1, 'Finch GO Bus Terminal', [[0.01, 0], [0, 0]]),
    ]);
    expect(result).toEqual({ directionId: 1, headsign: 'Finch GO Bus Terminal' });
  });
});
