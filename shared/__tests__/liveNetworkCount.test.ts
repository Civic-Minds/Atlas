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
    ] })).toEqual({ onTrip: 2, noTrip: 2 });
    expect(networkVehicleCounts({})).toEqual({ onTrip: 0, noTrip: 0 });
  });
  it('answers from a snapshot that has the counts, and not from one written before them', () => {
    const snap = { agency: 'ttc', capturedAt: 1000, network: { onTrip: 1600, noTrip: 231 } } as LiveSnapshotV2;
    expect(networkCountAnswer(snap, 1030)).toEqual({ agency: 'ttc', at: 1000, vehicles: 1600, noTrip: 231, ageSec: 30 });
    expect(networkCountAnswer({ ...snap, network: undefined }, 1030)).toBeNull();
    expect(networkCountAnswer(null, 1030)).toBeNull();
  });
});
