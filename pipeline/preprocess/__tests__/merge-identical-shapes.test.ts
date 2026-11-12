import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../../types/gtfs.js';
import { mergeIdenticalShapes } from '../merge-identical-shapes.js';
import { normalizeGtfs } from '../run.js';

// #1446: Fresno 39 toward the airport, 54 weekday trips alternating between shape ids 22539 and
// 22524: the same points and the same stops.

const line: [number, number][] = [[36.74, -119.78], [36.75, -119.77], [36.76, -119.76], [36.77, -119.75]];
const stopsOf = (tripId: string, stopIds: string[]) =>
  stopIds.map((stop_id, i) => ({ trip_id: tripId, stop_id, stop_sequence: String(i + 1), arrival_time: '', departure_time: '' }));

function feed(options: {
  secondShape?: [number, number][];
  secondStops?: string[];
  secondHeadsign?: string;
  secondRoute?: string;
  secondDirection?: string;
  routeType?: string;
} = {}): GtfsData {
  const stops = ['a', 'b', 'c', 'd'];
  const trips = Array.from({ length: 6 }, (_, i) => {
    // The first id has four trips, the second two (t1 and t3).
    const second = i === 1 || i === 3;
    return {
      route_id: second ? options.secondRoute ?? '39' : '39',
      service_id: 'wk',
      trip_id: `t${i}`,
      direction_id: second ? options.secondDirection ?? '1' : '1',
      trip_headsign: second ? options.secondHeadsign ?? 'Airport' : 'Airport',
      shape_id: second ? '22539' : '22524',
    };
  });
  return {
    agencies: [],
    routes: [{ route_id: '39', route_type: options.routeType ?? '3', route_short_name: '39' }, { route_id: '41', route_type: '3', route_short_name: '41' }],
    trips,
    stops: [],
    stopTimes: trips.flatMap(trip => stopsOf(trip.trip_id, trip.shape_id === '22539' ? options.secondStops ?? stops : stops)),
    calendar: [],
    calendarDates: [],
    shapes: [{ id: '22524', points: line }, { id: '22539', points: options.secondShape ?? line.map(p => [...p] as [number, number]) }],
  } as unknown as GtfsData;
}

const shapeIds = (gtfs: GtfsData) => gtfs.trips.map(trip => trip.shape_id);

describe('mergeIdenticalShapes (#1446)', () => {
  it('joins two shape ids with the same points and the same stops under the busier id', () => {
    const result = mergeIdenticalShapes(feed());
    expect(shapeIds(result.gtfs)).toEqual(['22524', '22524', '22524', '22524', '22524', '22524']);
    expect(result.mergedGroups).toBe(1);
    expect(result.mergedTrips).toBe(2);
    expect(result.merges).toEqual([{ routeId: '39', directionId: '1', kept: '22524', merged: ['22539'], trips: 2 }]);
  });

  it('runs for every route type, with no agency option', () => {
    expect(mergeIdenticalShapes(feed({ routeType: '1' })).mergedTrips).toBe(2);
    expect(shapeIds(normalizeGtfs(feed(), undefined))).toEqual(['22524', '22524', '22524', '22524', '22524', '22524']);
  });

  it('keeps the same stops on another path apart: one point off, a deviation between stops, a longer line', () => {
    const before = ['22524', '22539', '22524', '22539', '22524', '22524'];
    // One point a metre away.
    const nudged = feed({ secondShape: [line[0], [36.75001, -119.77], line[2], line[3]] });
    expect(shapeIds(mergeIdenticalShapes(nudged).gtfs)).toEqual(before);
    // Another street between the second and third stop.
    const deviation = feed({ secondShape: [line[0], line[1], [36.755, -119.75], line[2], line[3]] });
    expect(shapeIds(mergeIdenticalShapes(deviation).gtfs)).toEqual(before);
    // The same points and one more.
    const longer = feed({ secondShape: [...line, [36.78, -119.74]] });
    expect(shapeIds(mergeIdenticalShapes(longer).gtfs)).toEqual(before);
    // The same points the other way round.
    const reversed = feed({ secondShape: [...line].reverse() });
    expect(shapeIds(mergeIdenticalShapes(reversed).gtfs)).toEqual(before);
  });

  it('keeps the same path with other stops apart: an express beside a local', () => {
    const express = feed({ secondStops: ['a', 'd'] });
    const result = mergeIdenticalShapes(express);
    expect(result.gtfs).toBe(express);
    expect(result.mergedTrips).toBe(0);
  });

  it('keeps another headsign, direction or route apart', () => {
    for (const other of [feed({ secondHeadsign: 'Airport via Clinton' }), feed({ secondDirection: '0' }), feed({ secondRoute: '41' })]) {
      const result = mergeIdenticalShapes(other);
      expect(result.gtfs).toBe(other);
      expect(result.mergedGroups).toBe(0);
    }
  });

  it('joins only the ids whose trips make the same set of stop sequences', () => {
    // 22524 runs local and express; 22539 runs local only: not the same service, left apart.
    const mixed = feed();
    mixed.stopTimes = mixed.stopTimes.filter(st => !(st.trip_id === 't0' && (st.stop_id === 'b' || st.stop_id === 'c')));
    expect(mergeIdenticalShapes(mixed).gtfs).toBe(mixed);
  });

  it('leaves trips with no stop times, and a feed with one shape per pattern, as they are', () => {
    const noStopTimes = { ...feed(), stopTimes: [] } as GtfsData;
    expect(mergeIdenticalShapes(noStopTimes).gtfs).toBe(noStopTimes);
    const single = feed();
    for (const trip of single.trips) trip.shape_id = '22524';
    expect(mergeIdenticalShapes(single).gtfs).toBe(single);
  });

  it('reads stop order from stop_sequence, not file order', () => {
    const shuffled = feed();
    shuffled.stopTimes = [...shuffled.stopTimes].reverse();
    expect(mergeIdenticalShapes(shuffled).mergedTrips).toBe(2);
  });
});
