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

  it("names the destination from the trip's own direction when one is known, even where the heading points the other way (#1164)", () => {
    // Heading east, which alone picks direction 0; the trip says direction 1 (a car turning at a terminal loop).
    const result = inferLiveDirection(vehicle({ directionId: 1 }), [
      feature(0, 'Newmarket Terminal', [[0, 0], [0.01, 0]]),
      feature(1, 'Finch GO Bus Terminal', [[0.01, 0], [0, 0]]),
    ]);
    expect(result).toEqual({ directionId: 1, headsign: 'Finch GO Bus Terminal' });
  });

  it("carries the matched shape's role, so a short turn can be told from a branch (CIV-1043)", () => {
    const f = { ...feature(1, 'Finch GO Bus Terminal', [[0.01, 0], [0, 0]]) };
    f.properties = { ...f.properties, stretchRole: 'variant' };
    expect(inferLiveDirection(vehicle({ directionId: 1 }), [f])).toEqual({ directionId: 1, headsign: 'Finch GO Bus Terminal', stretchRole: 'variant' });
  });

  it('keeps the direction when a full route and its short turn share track', () => {
    const result = inferLiveDirection(vehicle({ bearing: 270 }), [
      feature(0, 'Newmarket Terminal', [[0, 0], [0.01, 0]]),
      feature(1, 'Finch GO Bus Terminal', [[0.01, 0], [0, 0]]),
      feature(1, 'Mid Terminal', [[0.01, 0], [0.002, 0]]),
    ]);
    expect(result).toEqual({ directionId: 1, headsign: null });
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
