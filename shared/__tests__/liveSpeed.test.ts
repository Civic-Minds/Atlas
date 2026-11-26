import { describe, expect, it } from 'vitest';
import { speedStretches, speedTraversals, summarizeSpeed, type SpeedTraversal } from '../liveSpeed';
import { SPEED_MINIMUMS } from '../rules/live';
import type { Pattern } from '../segmentDelay';

// CIV-2919: Speed, average speed by stretch and time of day, with Ryan's starting minimums (SPEED_MINIMUMS).
const shape = { pts: [[0, 0], [0, 0.03]] as [number, number][], cum: [0, 3000], total: 3000 };
const pattern: Pattern = { id: 'p', directionId: 0, shape: shape as never, stops: [0, 150, 300, 450, 900, 1000, 1600, 1700].map((along, i) => ({ stopId: `s${i}`, along })) };

describe('speedStretches (CIV-2919)', () => {
  it('merges consecutive stops until a stretch reaches the minimum length, the short end joining the last', () => {
    const s = speedStretches(pattern, 25);
    expect(s.map(x => `${x.fromStopId}-${x.toStopId}`)).toEqual(['s0-s3', 's3-s4', 's4-s7']);
    // Measured from leaving the first stop (25 m past it) to reaching the last.
    expect(s[0].metres).toBe(450 - 25);
  });
  it('a pattern shorter than the minimum has no stretch', () => {
    expect(speedStretches({ ...pattern, stops: pattern.stops.slice(0, 3) }, 25)).toEqual([]);
  });
});

describe('speedTraversals (CIV-2919)', () => {
  it('times a stretch from leaving its first stop to reaching its last, within one unbroken leg', () => {
    const stretches = speedStretches(pattern, 25);
    // 5 m/s along the line from t=0, one fix a minute.
    const projected = Array.from({ length: 8 }, (_, i) => ({ t: i * 60, along: i * 300, perpM: 5 }));
    const t = speedTraversals(projected, pattern, stretches, '2026-11-18', 25);
    expect(t[0]).toMatchObject({ key: '0|s0|s3', departT: 5, sec: 85, date: '2026-11-18' });
  });
});

describe('summarizeSpeed (CIV-2919)', () => {
  const stretch = { fromStopId: 'a', toStopId: 'b', directionId: 0, metres: 1000 };
  const key = '0|a|b';
  // Hours as epoch seconds / 3600 (UTC), for the test's own clock.
  const hourOf = (t: number) => Math.floor(t / 3600) % 24;
  const day = (d: number) => `2026-11-${String(d).padStart(2, '0')}`; // 2026-11-16 is a Monday
  const trips = (days: number[], perDaySlot: number, hour: number, sec: number): SpeedTraversal[] =>
    days.flatMap(d => Array.from({ length: perDaySlot }, (_, i) => ({ key, departT: hour * 3600 + i * 60, sec, date: day(d) })));
  const weekdays7 = [16, 17, 18, 19, 20, 23, 24];

  it('gives average speed per slot (total distance over total time), weekdays only', () => {
    const t = [...trips(weekdays7, 3, 7, 300), ...trips(weekdays7, 3, 16, 400), ...trips([21, 22], 5, 7, 60)];
    const [s] = summarizeSpeed([stretch], t, hourOf);
    expect(s.kmh.amPeak).toBe(12);
    expect(s.kmh.pmPeak).toBe(9);
    expect(s.kmh.midday).toBeNull();
    expect(s.weekdays).toBe(7);
    expect(s.totalTrips).toBe(42);
  });

  it('shows nothing below the weekday, trip and per-slot minimums', () => {
    const six = summarizeSpeed([stretch], trips(weekdays7.slice(0, 6), 6, 7, 300), hourOf)[0];
    expect(six).toMatchObject({ notMeasured: 'weekdays', kmh: { amPeak: null } });
    const few = summarizeSpeed([stretch], trips(weekdays7, 1, 7, 300), hourOf)[0];
    expect(few.notMeasured).toBe('trips');
    // Enough trips overall, but one slot under its own minimum.
    const t = [...trips(weekdays7, 4, 7, 300), ...trips(weekdays7.slice(0, SPEED_MINIMUMS.tripsPerSlot - 1), 1, 11, 300)];
    const slot = summarizeSpeed([stretch], t, hourOf)[0];
    expect(slot.notMeasured).toBeUndefined();
    expect(slot.kmh.amPeak).toBe(12);
    expect(slot.kmh.midday).toBeNull();
  });
});
