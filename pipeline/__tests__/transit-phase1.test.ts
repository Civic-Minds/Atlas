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

  describe('patterns kept only by a day\'s own shape pick (CIV-1720, #1547)', () => {
    const feed = (other: number) => {
      const trips = [
        ...Array.from({ length: other }, (_, i) => ({ route_id: '18', service_id: 'wd', trip_id: `o${i}`, trip_headsign: 'Schuylkill Ave.', direction_id: '1', shape_id: 'main' })),
        ...Array.from({ length: 6 }, (_, i) => ({ route_id: '18', service_id: 'wd', trip_id: `p${i}`, trip_headsign: 'BTC', direction_id: '1', shape_id: 'picked' })),
      ];
      const stopTimes = trips.map((trip, i) => ({
        trip_id: trip.trip_id, arrival_time: gtfsTime(540 + i * 30), departure_time: gtfsTime(540 + i * 30), stop_id: 'origin', stop_sequence: '1',
      }));
      return {
        agencies: [], routes: [{ route_id: '18', route_short_name: '18', route_type: '3' }], trips,
        stops: [{ stop_id: 'origin', stop_name: 'Origin', stop_lat: '43', stop_lon: '-79' }], stopTimes,
        calendar: [{ service_id: 'wd', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260101', end_date: '20261231' }],
        calendarDates: [], shapes: [],
      } as GtfsData;
    };
    const filter = new Map([['18::1::Schuylkill Ave.', new Set(['main'])], ['18::1::BTC', new Set(['picked'])]]);
    const dayPickShapes = new Map([['18::1::BTC', new Set(['picked'])]]);
    const monday = (gtfs: GtfsData) => computeRawDepartures(gtfs, '20260105', filter, undefined, { dayPickShapes })
      .filter(r => r.day === 'Monday').map(r => r.headsign).sort();

    it('drops them beside another pattern of the direction with a timetable', () => {
      expect(monday(feed(4))).toEqual(['Schuylkill Ave.']);
    });

    it('keeps them when the direction\'s other pattern is one stray trip (BARTA 18 Sunday)', () => {
      expect(monday(feed(1))).toEqual(['BTC']);
    });
  });
});
