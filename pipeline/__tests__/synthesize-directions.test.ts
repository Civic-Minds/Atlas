import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../types/gtfs';
import { synthesizeMissingDirections, synthesizeTripHeadsigns } from '../synthesize-directions';

function feed(): GtfsData {
  return {
    agencies: [],
    routes: [{ route_id: '603', route_short_name: '603', route_long_name: 'Green Line', route_type: '3' }],
    trips: [{ trip_id: 't1', route_id: '603', service_id: 'weekday', trip_headsign: 'GREEN LINE', direction_id: '0' }],
    stops: [{ stop_id: 'end', stop_name: 'Whirlpool Aero Car', stop_lat: '43.1', stop_lon: '-79.0' }],
    stopTimes: [{ trip_id: 't1', arrival_time: '12:00:00', departure_time: '12:00:00', stop_id: 'end', stop_sequence: '1' }],
    calendar: [],
    calendarDates: [],
    shapes: [],
    frequencies: [],
  };
}

describe('synthesizeTripHeadsigns', () => {
  it('replaces a route-name-only headsign with the terminal stop', () => {
    const out = synthesizeTripHeadsigns(feed());
    expect(out.trips[0].trip_headsign).toBe('Whirlpool Aero Car');
  });

  it('leaves a useful published destination unchanged', () => {
    const input = feed();
    input.trips[0].trip_headsign = 'Downtown';
    expect(synthesizeTripHeadsigns(input).trips[0].trip_headsign).toBe('Downtown');
  });

  it('replaces compact route-name headsigns with the terminal stop', () => {
    const input = feed();
    input.routes[0].route_short_name = '2';
    input.routes[0].route_long_name = 'CROSSTOWN 2';
    input.trips[0].trip_headsign = 'Crosstown2';
    expect(synthesizeTripHeadsigns(input).trips[0].trip_headsign).toBe('Whirlpool Aero Car');
  });
});

describe('synthesizeMissingDirections: a route that labels only some trips (#730)', () => {
  // Coast NH route 40: weekday trips labelled 0/1, Saturday trips on their own shapes with no direction_id.
  const trip = (id: string, dir: string | undefined, shape: string, headsign: string) =>
    ({ trip_id: id, route_id: '3795', service_id: 'svc', direction_id: dir, shape_id: shape, trip_headsign: headsign });
  const routeFeed = (trips: ReturnType<typeof trip>[]): GtfsData => ({
    agencies: [], routes: [{ route_id: '3795', route_short_name: '40', route_long_name: '', route_type: '3' }],
    trips: trips as GtfsData['trips'], stops: [], stopTimes: [], calendar: [], calendarDates: [], shapes: [], frequencies: [],
  });
  const dirs = (g: GtfsData) => Object.fromEntries(g.trips.map(t => [t.trip_id, t.direction_id]));

  it('gives a blank trip the direction labelled trips use on its headsign, so a Saturday inbound is kept', () => {
    const out = synthesizeMissingDirections(routeFeed([
      trip('wk-out', '0', '66001', 'Borthwick Trolley Outbound'), trip('wk-in', '1', '66002', 'Borthwick Trolley Inbound'),
      trip('sat-out', undefined, '66729', 'Borthwick Trolley Outbound'), trip('sat-in', undefined, '66677', 'Borthwick Trolley Inbound'),
    ]));
    expect(dirs(out)).toMatchObject({ 'sat-out': '0', 'sat-in': '1' });
    expect(out.synthesizedDirectionRouteIds?.has('3795') ?? false).toBe(false);
  });

  it('prefers the shape, and leaves a trip blank when its shape or headsign is used both ways', () => {
    const out = synthesizeMissingDirections(routeFeed([
      trip('a', '0', 'loop', 'Downtown'), trip('b', '1', 'loop', 'Uptown'),
      trip('c', '1', 'east', 'Downtown'),
      trip('blank-loop', undefined, 'loop', 'Downtown'), trip('blank-east', undefined, 'east', 'Downtown'),
      trip('blank-new', undefined, 'new', 'Downtown'),
    ]));
    expect(dirs(out)).toMatchObject({ 'blank-loop': undefined, 'blank-east': '1', 'blank-new': undefined });
  });

  it('leaves a fully labelled route alone and still synthesizes a fully blank one', () => {
    const labelled = synthesizeMissingDirections(routeFeed([trip('a', '0', 's1', 'X'), trip('b', '1', 's2', 'Y')]));
    expect(dirs(labelled)).toEqual({ a: '0', b: '1' });
    const blank = synthesizeMissingDirections(routeFeed([trip('a', undefined, 's1', 'X'), trip('b', undefined, 's1', 'X'), trip('c', undefined, 's2', 'Y')]));
    expect(dirs(blank)).toEqual({ a: '0', b: '0', c: '1' });
    expect(blank.synthesizedDirectionRouteIds?.has('3795')).toBe(true);
  });
});
