import { describe, expect, it } from 'vitest';
import { poolSingleTripShapes } from '../preprocess/pool-single-trip-shapes';
import type { GtfsData } from '../../types/gtfs';

// RCT 20 southbound (#776): two Eureka-bound trips a day, 06:45 on shape No_Glen (Smith River
// to Eureka, the full trunk) and 14:15 on shape No_Medical (Crescent City to Eureka), one trip
// each, so phase 1 dropped both groups and southbound Eureka had no route line.
function feed(trips: Array<[string, string, string, string, string]>): GtfsData {
  const line = (id: string, lengthDeg: number) => ({ id, points: [[41.0, -124.0], [41.0 + lengthDeg, -124.0]] as [number, number][] });
  return {
    agencies: [], routes: [], stops: [], stopTimes: [], calendar: [], calendarDates: [],
    shapes: [line('NoGlen', 1.2), line('NoMedical', 1.0), line('Short', 0.2)],
    trips: trips.map(([trip_id, route_id, service_id, trip_headsign, shape_id]) =>
      ({ trip_id, route_id, service_id, trip_headsign, shape_id, direction_id: '0' })),
  } as GtfsData;
}

describe('poolSingleTripShapes', () => {
  it('draws a headsign whose trips each have their own shape on the longest shape (RCT 20 Eureka)', () => {
    const { gtfs, pooledGroups, pooledTrips } = poolSingleTripShapes(feed([
      ['am', '120', 'TuFr', 'Eureka (Southbound)', 'NoGlen'],
      ['pm', '120', 'TuFr', 'Eureka (Southbound)', 'NoMedical'],
    ]));
    expect(gtfs.trips.map(t => t.shape_id)).toEqual(['NoGlen', 'NoGlen']);
    expect([pooledGroups, pooledTrips]).toEqual([1, 1]);
  });

  it('leaves a headsign alone when any shape carries two or more trips', () => {
    const input = feed([
      ['a', '120', 'TuFr', 'Crescent City (Southbound)', 'Short'],
      ['b', '120', 'TuFr', 'Crescent City (Southbound)', 'Short'],
      ['c', '120', 'TuFr', 'Crescent City (Southbound)', 'NoGlen'],
    ]);
    expect(poolSingleTripShapes(input).gtfs).toBe(input);
  });

  it('leaves a single trip, and trips of different services, alone', () => {
    const input = feed([
      ['k', '120', 'TuFr', 'Klamath (Southbound)', 'Short'],
      ['sa', '120', 'Sa', 'Eureka (Southbound)', 'NoGlen'],
      ['mo', '120', 'Mo', 'Eureka (Southbound)', 'NoMedical'],
    ]);
    expect(poolSingleTripShapes(input).gtfs).toBe(input);
  });
});
