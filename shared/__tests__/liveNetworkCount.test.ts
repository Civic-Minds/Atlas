import { describe, expect, it } from 'vitest';
import { networkCountAnswer, networkVehicleCounts } from '../liveNetworkCount';
import type { LiveSnapshotV2 } from '../liveContract';

describe('whole-network vehicle counts (CIV-2939)', () => {
  it('counts vehicles on a trip apart from those with a position but no trip, whatever their route', () => {
    expect(networkVehicleCounts({ entity: [
      { vehicle: { position: {}, trip: { tripId: 't1', routeId: '504' } } },
      { vehicle: { position: {}, trip: { routeId: '29' } } },
      { vehicle: { position: {}, trip: null } },
      { vehicle: { position: {}, trip: { tripId: '', routeId: '' } } },
      { vehicle: { trip: { tripId: 't9' } } },
      {},
    ] })).toMatchObject({ onTrip: 2, noTrip: 2 });
    expect(networkVehicleCounts({})).toEqual({ onTrip: 0, noTrip: 0, atGarage: 0 });
  });
  it('answers from a snapshot that has the counts, and not from one written before them', () => {
    const snap = { agency: 'ttc', capturedAt: 1000, network: { onTrip: 1600, noTrip: 231 } } as LiveSnapshotV2;
    expect(networkCountAnswer(snap, 1030)).toEqual({ agency: 'ttc', at: 1000, vehicles: 1600, noTrip: 231, ageSec: 30 });
    expect(networkCountAnswer({ ...snap, network: undefined }, 1030)).toBeNull();
    expect(networkCountAnswer(null, 1030)).toBeNull();
  });
});

// CIV-2990 (#1832): of the vehicles with no trip, those parked at a garage: standing still with at least GARAGE_MIN_VEHICLES
// such vehicles within GARAGE_RADIUS_M. Moving vehicles and a lone parked one stay out.
describe('atGarage (CIV-2990)', () => {
  const at = (lat: number, lon: number, speed = 0) => ({ vehicle: { position: { latitude: lat, longitude: lon, speed } } });
  it('counts a group of parked vehicles, not a lone one or moving ones', async () => {
    const { networkVehicleCounts } = await import('../liveNetworkCount');
    const yard = Array.from({ length: 6 }, (_, i) => at(43.746 + i * 0.0001, -79.532));
    const lone = at(43.70, -79.40);
    const moving = Array.from({ length: 6 }, (_, i) => at(43.80 + i * 0.0001, -79.30, 8));
    const onTrip = { vehicle: { position: { latitude: 43.746, longitude: -79.532, speed: 0 }, trip: { tripId: 't1' } } };
    expect(networkVehicleCounts({ entity: [...yard, lone, ...moving, onTrip] })).toEqual({ onTrip: 1, noTrip: 13, atGarage: 6 });
  });
});
