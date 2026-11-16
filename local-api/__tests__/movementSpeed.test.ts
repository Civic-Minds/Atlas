import { describe, expect, it } from 'vitest';
import { MAX_REPORT_GAP_S, MovementSpeeds } from '../movementSpeed';

// About 111 m per 0.001 degree of latitude.
const LAT = 43.65, LON = -79.38;

describe('speed from movement between reports (CIV-1770)', () => {
  it('reads nothing on the first report, then the distance over the time between reports', () => {
    const s = new MovementSpeeds();
    expect(s.speedFor('ttc', 'v1', LAT, LON, 1000, 1000)).toBeNull();
    // 0.001 degree north (about 111 m) in 20 s: about 20 km/h, though the feed may say 0.
    expect(s.speedFor('ttc', 'v1', LAT + 0.001, LON, 1020, 1020)).toBe(20);
  });

  it('reads 0 for a vehicle that has not moved', () => {
    const s = new MovementSpeeds();
    s.speedFor('ttc', 'v1', LAT, LON, 1000, 1000);
    expect(s.speedFor('ttc', 'v1', LAT, LON, 1030, 1030)).toBe(0);
  });

  it('keeps the speed when the same report comes again', () => {
    const s = new MovementSpeeds();
    s.speedFor('ttc', 'v1', LAT, LON, 1000, 1000);
    s.speedFor('ttc', 'v1', LAT + 0.001, LON, 1020, 1020);
    expect(s.speedFor('ttc', 'v1', LAT + 0.001, LON, 1020, 1035)).toBe(20);
  });

  it('reads nothing across a long gap, a position jump, or without a report time', () => {
    const s = new MovementSpeeds();
    s.speedFor('ttc', 'v1', LAT, LON, 1000, 1000);
    expect(s.speedFor('ttc', 'v1', LAT + 0.001, LON, 1000 + MAX_REPORT_GAP_S + 1, 1200)).toBeNull();
    s.speedFor('ttc', 'v2', LAT, LON, 1000, 1000);
    expect(s.speedFor('ttc', 'v2', LAT + 0.1, LON, 1015, 1015)).toBeNull();
    expect(s.speedFor('ttc', 'v3', LAT, LON, null, 1000)).toBeNull();
  });

  it('keeps agencies apart', () => {
    const s = new MovementSpeeds();
    s.speedFor('ttc', 'v1', LAT, LON, 1000, 1000);
    expect(s.speedFor('yrt', 'v1', LAT + 0.001, LON, 1020, 1020)).toBeNull();
  });
});
