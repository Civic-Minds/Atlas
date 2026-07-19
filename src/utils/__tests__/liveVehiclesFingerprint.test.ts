import { describe, expect, it } from 'vitest';
import { liveVehiclesEqual, liveVehiclesFingerprint } from '../liveVehiclesFingerprint';

const v = (id: string, lat: number, lon: number, status = 'on_time') => ({
  id, lat, lon, status, delayMin: 0, headsign: 'A', routeShortName: '1',
});

describe('liveVehiclesFingerprint', () => {
  it('matches when only order differs', () => {
    const a = [v('1', 43.65, -79.38), v('2', 43.66, -79.39)];
    const b = [v('2', 43.66, -79.39), v('1', 43.65, -79.38)];
    expect(liveVehiclesFingerprint(a)).toBe(liveVehiclesFingerprint(b));
    expect(liveVehiclesEqual(a, b)).toBe(true);
  });

  it('differs when a vehicle moves or status changes', () => {
    const a = [v('1', 43.65, -79.38)];
    const moved = [v('1', 43.66, -79.38)];
    const late = [{ ...v('1', 43.65, -79.38), status: 'late' }];
    expect(liveVehiclesEqual(a, moved)).toBe(false);
    expect(liveVehiclesEqual(a, late)).toBe(false);
  });

  it('ignores sub-meter GPS jitter via rounding', () => {
    const a = [v('1', 43.650001, -79.380001)];
    const b = [v('1', 43.650004, -79.380004)];
    expect(liveVehiclesEqual(a, b)).toBe(true);
  });
});
