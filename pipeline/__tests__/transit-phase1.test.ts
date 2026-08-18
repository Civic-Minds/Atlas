import { describe, expect, it } from 'vitest';
import { computeRawDepartures } from '../transit-phase1';
import type { GtfsData } from '../../types/gtfs';

function gtfsTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

describe('computeRawDepartures', () => {
  it('keeps same-headsign physical branches separate', () => {
    const trips = [
      ...Array.from({ length: 6 }, (_, i) => ({ route_id: '14', service_id: 'weekday', trip_id: `a${i}`, trip_headsign: 'Appleby GO', direction_id: '0', shape_id: 'branch-a' })),
      ...Array.from({ length: 6 }, (_, i) => ({ route_id: '14', service_id: 'weekday', trip_id: `b${i}`, trip_headsign: 'Appleby GO', direction_id: '0', shape_id: 'branch-b' })),
    ];
    const stopTimes = trips.map((trip, i) => ({
      trip_id: trip.trip_id,
      arrival_time: gtfsTime(i < 6 ? 540 + i * 60 : 570 + (i - 6) * 60),
      departure_time: gtfsTime(i < 6 ? 540 + i * 60 : 570 + (i - 6) * 60),
      stop_id: 'origin', stop_sequence: '1',
    }));
    const gtfs = {
      agencies: [], routes: [{ route_id: '14', route_short_name: '14', route_type: '3' }], trips,
      stops: [{ stop_id: 'origin', stop_name: 'Origin', stop_lat: '43', stop_lon: '-79' }], stopTimes,
      calendar: [{ service_id: 'weekday', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }],
      calendarDates: [], shapes: [],
    } as GtfsData;

    const results = computeRawDepartures(gtfs, '20260105').filter(r => r.day === 'Monday');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.shapeId).sort()).toEqual(['branch-a', 'branch-b']);
    expect(results.every(r => r.departureTimes.length === 6)).toBe(true);
    expect(results.every(r => r.gaps.every(gap => gap === 60))).toBe(true);
  });
});
