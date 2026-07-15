import { describe, expect, it } from 'vitest';
import { normalizeSnapshot, statusForAge } from '../../api/liveStore.js';

describe('Atlas live provider contract', () => {
  it('normalizes legacy vehicle archives into atlas.live.v1 records', () => {
    const snapshot = normalizeSnapshot({
      ts: 1_700_000_000,
      vehicles: [{ id: 'v1', r: '510', lat: 43.6, lon: -79.4, spd: 12, t: 1_699_999_999 }],
    }, 'vehicle_positions', 'ttc', 'positions/ttc/2023-11-14/1700000000.json');

    expect(snapshot).toMatchObject({ schemaVersion: 'atlas.live.v1', agency: 'ttc', feedType: 'vehicle_positions', capturedAt: 1_700_000_000 });
    expect(snapshot.records[0]).toMatchObject({ id: 'v1', routeId: '510', speedKmh: 12, reportedAt: 1_699_999_999 });
  });

  it('keeps freshness thresholds explicit', () => {
    expect(statusForAge(90)).toBe('fresh');
    expect(statusForAge(300)).toBe('degraded');
    expect(statusForAge(900)).toBe('stale');
    expect(statusForAge(901)).toBe('unavailable');
  });
});
