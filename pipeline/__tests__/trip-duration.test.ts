import { describe, expect, it } from 'vitest';
import { computeRailTripDurations } from '../trip-duration';
import type { GtfsData } from '../../types/gtfs';

const CALENDAR = [{
  service_id: 'WKDY',
  monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0',
  start_date: '20260101', end_date: '20261231',
}];

function stopTime(tripId: string, seq: number, stopId: string, time: string) {
  return { trip_id: tripId, arrival_time: time, departure_time: time, stop_id: stopId, stop_sequence: String(seq) };
}

function baseGtfs(overrides: Partial<GtfsData>): GtfsData {
  return {
    agencies: [],
    routes: [],
    trips: [],
    stops: [],
    stopTimes: [],
    calendar: CALENDAR,
    calendarDates: [],
    shapes: [],
    ...overrides,
  };
}

describe('computeRailTripDurations', () => {
  it('picks the dominant shape by trip count, not the longest shape', () => {
    // Route R1: 5 trips on the short/common shape (SHP_COMMON), 1 trip on a
    // longer one-off detour shape (SHP_LONG). The detour has fewer stops but
    // spans more distance — computeRailTripDurations must not be fooled by
    // that; it should still pick SHP_COMMON as representative.
    const trips = [
      ...Array.from({ length: 5 }, (_, i) => ({
        trip_id: `common-${i}`, route_id: 'R1', service_id: 'WKDY', direction_id: '0', shape_id: 'SHP_COMMON',
      })),
      { trip_id: 'detour-1', route_id: 'R1', service_id: 'WKDY', direction_id: '0', shape_id: 'SHP_LONG' },
    ];

    const stopTimes = [
      ...trips.filter(t => t.shape_id === 'SHP_COMMON').flatMap(t => [
        stopTime(t.trip_id, 1, 'A', '11:50:00'),
        stopTime(t.trip_id, 2, 'B', '12:10:00'),
      ]),
      stopTime('detour-1', 1, 'A', '11:50:00'),
      stopTime('detour-1', 2, 'C', '12:00:00'),
      stopTime('detour-1', 3, 'B', '12:40:00'),
    ];

    const gtfs = baseGtfs({
      routes: [{ route_id: 'R1', route_short_name: 'Red', route_type: '2' }],
      trips,
      stops: [{ stop_id: 'A', stop_name: 'A', stop_lat: '0', stop_lon: '0' }, { stop_id: 'B', stop_name: 'B', stop_lat: '0', stop_lon: '0' }, { stop_id: 'C', stop_name: 'C', stop_lat: '0', stop_lon: '0' }],
      stopTimes,
    });

    const result = computeRailTripDurations(gtfs, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].representativeShapeId).toBe('SHP_COMMON');
    expect(result[0].durationMinutes).toBe(20);
    expect(result[0].stopSequenceRaw).toEqual(['A', 'B']);
  });

  it('picks the dominant direction_id even when it is 1, not 0', () => {
    const trips = Array.from({ length: 3 }, (_, i) => ({
      trip_id: `t${i}`, route_id: 'R2', service_id: 'WKDY', direction_id: '1', shape_id: 'SHP',
    }));
    const stopTimes = trips.flatMap(t => [
      stopTime(t.trip_id, 1, 'X', '11:55:00'),
      stopTime(t.trip_id, 2, 'Y', '12:15:00'),
    ]);

    const gtfs = baseGtfs({
      routes: [{ route_id: 'R2', route_short_name: 'Yellow-S', route_type: '1' }],
      trips,
      stops: [{ stop_id: 'X', stop_name: 'X', stop_lat: '0', stop_lon: '0' }, { stop_id: 'Y', stop_name: 'Y', stop_lat: '0', stop_lon: '0' }],
      stopTimes,
    });

    const result = computeRailTripDurations(gtfs, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].directionId).toBe('1');
    expect(result[0].durationMinutes).toBe(20);
  });

  it('normalizes stop sequences through parent_station', () => {
    const trips = [{ trip_id: 't1', route_id: 'R3', service_id: 'WKDY', direction_id: '0', shape_id: 'SHP' }];
    const stopTimes = [
      stopTime('t1', 1, 'PLATFORM_1A', '12:00:00'),
      stopTime('t1', 2, 'PLATFORM_2B', '12:20:00'),
    ];

    const gtfs = baseGtfs({
      routes: [{ route_id: 'R3', route_short_name: 'Green', route_type: '1' }],
      trips,
      stops: [
        { stop_id: 'PLATFORM_1A', stop_name: 'Station 1 Platform A', stop_lat: '0', stop_lon: '0', parent_station: 'STATION_1' },
        { stop_id: 'PLATFORM_2B', stop_name: 'Station 2 Platform B', stop_lat: '0', stop_lon: '0', parent_station: 'STATION_2' },
      ],
      stopTimes,
    });

    const result = computeRailTripDurations(gtfs, 'test');
    expect(result).toHaveLength(1);
    expect(result[0].stopSequenceRaw).toEqual(['PLATFORM_1A', 'PLATFORM_2B']);
    expect(result[0].stopSequenceNormalized).toEqual(['STATION_1', 'STATION_2']);
  });

  it('excludes non-rail routes', () => {
    const trips = [{ trip_id: 't1', route_id: 'BUS1', service_id: 'WKDY', direction_id: '0', shape_id: 'SHP' }];
    const stopTimes = [
      stopTime('t1', 1, 'A', '12:00:00'),
      stopTime('t1', 2, 'B', '12:20:00'),
    ];

    const gtfs = baseGtfs({
      routes: [{ route_id: 'BUS1', route_short_name: 'BB-A', route_type: '3' }],
      trips,
      stops: [{ stop_id: 'A', stop_name: 'A', stop_lat: '0', stop_lon: '0' }, { stop_id: 'B', stop_name: 'B', stop_lat: '0', stop_lon: '0' }],
      stopTimes,
    });

    expect(computeRailTripDurations(gtfs, 'test')).toHaveLength(0);
  });
});
