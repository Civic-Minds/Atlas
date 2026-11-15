import { describe, expect, it } from 'vitest';
import type { GtfsTrip } from '../../types/gtfs.js';
import { checkShapeShare, drawnShapeShare, headlineSlowerThanPeriods, stopIdsByTrip } from '../shapeShareCheck.js';

// CCTA 1 Weekday to Downtown Transit Center (CIV-1138, #1211): 31 trips on three shapes.
// p_1440971 (12 trips) runs Cherry St (806011) as its second-to-last stop; p_1442129 (18 trips)
// swaps it for Pearl St (4254428); p_1440973 (1 trip) adds stop 805968.
const trunk = Array.from({ length: 20 }, (_, i) => `s${i}`);
const shapeStops: Record<string, string[]> = {
  p_1440971: [...trunk, '806011', 'dtc'],
  p_1442129: [...trunk, '4254428', 'dtc'],
  p_1440973: [...trunk, '805968', '806011', 'dtc'],
};
const counts: Record<string, number> = { p_1440971: 12, p_1442129: 18, p_1440973: 1 };
const trips: GtfsTrip[] = [];
const stopTimes: Array<{ trip_id: string; stop_id: string; stop_sequence: string; arrival_time: string; departure_time: string }> = [];
for (const [shape, n] of Object.entries(counts)) {
  for (let i = 0; i < n; i++) {
    const trip_id = `${shape}-${i}`;
    trips.push({ trip_id, route_id: '19137', service_id: 'wk', direction_id: '1', trip_headsign: 'Downtown Transit Center', shape_id: shape } as GtfsTrip);
    shapeStops[shape].forEach((stop_id, seq) => stopTimes.push({ trip_id, stop_id, stop_sequence: String(seq + 1), arrival_time: '', departure_time: '' }));
  }
}
// Another direction and a Saturday service, which must not be counted.
trips.push({ trip_id: 'other-dir', route_id: '19137', service_id: 'wk', direction_id: '0', trip_headsign: 'Walmart', shape_id: 'p_x' } as GtfsTrip);
trips.push({ trip_id: 'sat', route_id: '19137', service_id: 'sat', direction_id: '1', trip_headsign: 'Downtown Transit Center', shape_id: 'p_1440971' } as GtfsTrip);
const byTrip = stopIdsByTrip(stopTimes as any);
const base = { trips, stopIdsByTrip: byTrip, activeServiceIds: new Set(['wk']), routeIds: new Set(['19137']), directionId: 1, headsign: 'Downtown Transit Center' };

// The published row from release-mvtnhbn1: headline 32 against a direction running every 30.
const cctaRow = { headway: 32, headwayByPeriod: { amPeak: 43, midday: 30, pmPeak: 62, evening: 75 } };

describe('shape share check (CIV-1657)', () => {
  it('finds the drawn minority shape and its share (CCTA 1, 12 of 31)', () => {
    const r = drawnShapeShare({ ...base, stopOrder: shapeStops.p_1440971 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.drawnShapeId).toBe('p_1440971');
    expect(r.value.drawnShapeTrips).toBe(12);
    expect(r.value.headsignTrips).toBe(31);
    expect(r.value.shapes[0]).toEqual({ shapeId: 'p_1442129', trips: 18 });
  });

  it('flags CCTA 1 when the 12-trip shape is drawn and the headline reads 32 against a midday 30', () => {
    const flag = checkShapeShare({ ...cctaRow, drawnShapeTrips: 12, headsignTrips: 31 });
    expect(flag).not.toBeNull();
    expect(flag).toMatchObject({ drawnShapeTrips: 12, headsignTrips: 31, headway: 32, period: 'midday', periodValue: 30 });
  });

  it('does not flag when the majority shape (18 of 31) is drawn', () => {
    const r = drawnShapeShare({ ...base, stopOrder: shapeStops.p_1442129 });
    expect(r.ok && r.value.drawnShapeId).toBe('p_1442129');
    expect(checkShapeShare({ ...cctaRow, drawnShapeTrips: 18, headsignTrips: 31 })).toBeNull();
  });

  it('does not flag a minority shape whose headline is not slower than its periods (today\'s CCTA 1 reads 30)', () => {
    const today = { headway: 30, headwayByPeriod: { amPeak: 31, midday: 30, pmPeak: 30, evening: 75 } };
    expect(headlineSlowerThanPeriods(today.headway, today.headwayByPeriod)).toBe(false);
    expect(checkShapeShare({ ...today, drawnShapeTrips: 12, headsignTrips: 31 })).toBeNull();
  });

  it('flags the #771 reproductions (TriMet 35 16 of 34, Freedom Transit M 3 of 10)', () => {
    expect(checkShapeShare({ headway: 61, headwayByPeriod: { amPeak: 28, midday: 30, pmPeak: 29 }, drawnShapeTrips: 16, headsignTrips: 34 })).not.toBeNull();
    expect(checkShapeShare({ headway: 248, headwayByPeriod: { amPeak: 60, midday: 69, pmPeak: 60 }, drawnShapeTrips: 3, headsignTrips: 10 })).not.toBeNull();
  });

  it('treats exactly half as not under half', () => {
    expect(checkShapeShare({ headway: 60, headwayByPeriod: { midday: 30 }, drawnShapeTrips: 12, headsignTrips: 24 })).toBeNull();
  });

  it('compares with the fastest daytime period when the row has no midday value', () => {
    expect(headlineSlowerThanPeriods(45, { amPeak: 40, midday: null, pmPeak: 50 })).toBe(true);
    expect(headlineSlowerThanPeriods(40, { amPeak: 40, midday: null, pmPeak: 50 })).toBe(false);
    expect(headlineSlowerThanPeriods(40, {})).toBe(false);
    expect(headlineSlowerThanPeriods(null, { midday: 30 })).toBe(false);
  });

  it('skips a row whose drawn stops match no shape rather than guessing', () => {
    const r = drawnShapeShare({ ...base, stopOrder: ['a', 'b', 'c'] });
    expect(r.ok).toBe(false);
  });

  it('skips a row with no trips on the day', () => {
    const r = drawnShapeShare({ ...base, activeServiceIds: new Set(['none']), stopOrder: shapeStops.p_1440971 });
    expect(r).toEqual({ ok: false, reason: 'no matching headsign trips on the day' });
  });
});
