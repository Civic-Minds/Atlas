import { describe, expect, it } from 'vitest';
import { relabelCtaSameWayLoops } from '../cta-loop-directions.js';
import type { GtfsData } from '../../../types/gtfs.js';

// CTA Brown Line, 2017 feed (#1525): loops leave Kimball (platform 30250), run round the Loop and come back to Kimball
// (platform 30249), all direction 0; a 2 AM loop to Kedzie and back is published as direction 1.
const LOOP = ['30250', '30226', '30230', '30138', '30142', '30139', '30231', '30225', '30249'];
const SHORT = ['30250', '30226', '30225', '30249'];
const trip = (trip_id: string, direction_id: string, route_id = 'Brn') => ({ route_id, service_id: 'wk', trip_id, direction_id });
const times = (trip_id: string, stops: string[]) =>
  stops.map((stop_id, i) => ({ trip_id, stop_id, stop_sequence: String(i + 1), arrival_time: '02:00:00', departure_time: '02:00:00' }));
const stops = [...new Set([...LOOP, '40000', '40001', '40002'])].map(stop_id => ({ stop_id, parent_station: stop_id === '30250' || stop_id === '30249' ? '41290' : '' }));
const feed = (trips: ReturnType<typeof trip>[], stopTimes: ReturnType<typeof times>): GtfsData => ({
  agencies: [], routes: [], stops, calendar: [], calendarDates: [], shapes: [], trips, stopTimes,
} as unknown as GtfsData);

describe('CTA loops marked the other direction (#1525)', () => {
  it('gives a same-way Kimball loop the direction of the line\'s other loops', () => {
    const { gtfs, relabelled } = relabelCtaSameWayLoops(feed(
      [trip('a', '0'), trip('b', '0'), trip('night', '1')],
      [...times('a', LOOP), ...times('b', LOOP), ...times('night', SHORT)],
    ));
    expect(relabelled).toEqual({ Brn: 1 });
    expect(gtfs.trips.map(t => t.direction_id)).toEqual(['0', '0', '0']);
  });

  it('leaves a loop run the other way round, a trip that is not a loop, and a majority direction as published', () => {
    const reversed = feed([trip('a', '0'), trip('b', '0'), trip('ccw', '1')], [...times('a', LOOP), ...times('b', LOOP), ...times('ccw', [...SHORT].reverse())]);
    expect(relabelCtaSameWayLoops(reversed).relabelled).toEqual({});
    const oneWay = feed([trip('a', '0'), trip('b', '0'), trip('in', '1')], [...times('a', LOOP), ...times('b', LOOP), ...times('in', ['30250', '30226', '30230'])]);
    expect(relabelCtaSameWayLoops(oneWay).relabelled).toEqual({});
    const even = feed([trip('a', '0'), trip('night', '1')], [...times('a', LOOP), ...times('night', SHORT)]);
    expect(relabelCtaSameWayLoops(even).relabelled).toEqual({});
    const otherRoute = feed([trip('a', '0'), trip('b', '0'), trip('night', '1', 'Org')], [...times('a', LOOP), ...times('b', LOOP), ...times('night', SHORT)]);
    expect(relabelCtaSameWayLoops(otherRoute).relabelled).toEqual({});
  });

  it('returns the feed unchanged when nothing moves (today\'s feed: every Brown Line trip is direction 0)', () => {
    const input = feed([trip('a', '0'), trip('b', '0')], [...times('a', LOOP), ...times('b', LOOP)]);
    expect(relabelCtaSameWayLoops(input).gtfs).toBe(input);
  });
});
