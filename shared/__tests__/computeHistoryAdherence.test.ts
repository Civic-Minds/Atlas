import { describe, it, expect } from 'vitest';
import { computeHistoryAdherence, type Snapshot } from '../computeHistoryAdherence';

describe('computeHistoryAdherence', () => {
  it('buckets delays by agency local hour (America/Toronto)', () => {
    // 2024-07-15 14:00 EDT = 18:00 UTC
    const snapshots: Snapshot[] = [{
      ts: Math.floor(Date.UTC(2024, 6, 15, 18, 0, 0) / 1000),
      trips: [{ id: 't1', r: '5677', d: 0, delay: 300 }],
    }];

    const result = computeHistoryAdherence('hamilton', '01', snapshots, 1);
    expect(result).not.toBeNull();
    expect(result!.byHour).toHaveLength(1);
    expect(result!.byHour[0].hour).toBe(14);
    expect(result!.byHour[0].avgDelayMin).toBe(5);
  });

  it('uses America/Vancouver for TransLink', () => {
    // 2024-01-15 10:00 PST = 18:00 UTC
    const snapshots: Snapshot[] = [{
      ts: Math.floor(Date.UTC(2024, 0, 15, 18, 0, 0) / 1000),
      trips: [{ id: 't1', r: '6641', d: 0, delay: 120 }],
    }];

    const result = computeHistoryAdherence('translink', '099', snapshots, 1);
    expect(result).not.toBeNull();
    expect(result!.byHour[0].hour).toBe(10);
  });

  it('returns null for unknown agency/route', () => {
    expect(computeHistoryAdherence('unknown', '99', [], 7)).toBeNull();
  });
});
