import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../types/gtfs';
import { inferDirectionsFromStopOrder, synthesizeMissingDirections, synthesizeTripHeadsigns } from '../synthesize-directions';

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

  it('leaves a trip blank when its shape says one direction and its headsign the other', () => {
    const out = synthesizeMissingDirections(routeFeed([
      trip('a', '0', 'west', 'Downtown'), trip('b', '1', 'east', 'Uptown'),
      trip('blank-conflict', undefined, 'west', 'Uptown'), trip('blank-agree', undefined, 'west', 'Downtown'),
    ]));
    expect(dirs(out)).toMatchObject({ 'blank-conflict': undefined, 'blank-agree': '0' });
  });

  it('leaves a fully labelled route alone and still synthesizes a fully blank one', () => {
    const labelled = synthesizeMissingDirections(routeFeed([trip('a', '0', 's1', 'X'), trip('b', '1', 's2', 'Y')]));
    expect(dirs(labelled)).toEqual({ a: '0', b: '1' });
    const blank = synthesizeMissingDirections(routeFeed([trip('a', undefined, 's1', 'X'), trip('b', undefined, 's1', 'X'), trip('c', undefined, 's2', 'Y')]));
    expect(dirs(blank)).toEqual({ a: '0', b: '0', c: '1' });
    expect(blank.synthesizedDirectionRouteIds?.has('3795')).toBe(true);
  });
});

describe('inferDirectionsFromStopOrder: routes with no direction_id (CIV-1500, Kingston 2017 and 2020)', () => {
  const run = (trips: [string, string, string[]][]) => inferDirectionsFromStopOrder(
    trips.map(([id, headsign]) => ({ trip_id: id, trip_headsign: headsign })),
    new Map(trips.map(([id, , stops]) => [id, stops])),
  );
  const dirs = (m: Map<string, string> | null) => (m ? Object.fromEntries(m) : null);

  it('splits a local route carrying both ways under one number, its directions on opposite sides of the street (Kingston 1)', () => {
    expect(dirs(run([
      ['out1', 'Saint Lawrence College', ['joyce', 'n1', 'n2', 'n3', 'slc']], ['out2', 'Saint Lawrence College', ['joyce', 'n1', 'n2', 'n3', 'slc']],
      ['in1', 'Montreal Street', ['slc', 's3', 's2', 's1', 'joyce']],
      ['short', 'Sorry...Not In Service', ['joyce', 'n1', 'n2', 'n3']],
    ]))).toEqual({ out1: '0', out2: '0', in1: '1', short: '0' });
  });

  it('reads a trip back from where the other ends to where it starts as the other direction, even through a shared one-way loop (Kingston 2)', () => {
    expect(dirs(run([
      ['out', 'Division Street', ['kc', 'a1', 'a2', 'loop1', 'loop2', 'loop3', 'joyce']],
      ['in', 'Kingston Centre', ['joyce', 'b1', 'loop1', 'loop2', 'loop3', 'b2', 'kc']],
    ]))).toEqual({ out: '0', in: '1' });
  });

  it('keeps a one-way trip split in two at Downtown as one direction (Kingston 701)', () => {
    expect(dirs(run([
      ['first', 'Express - Cataraqui Centre via Downtown', ['kings', 'k1', 'downtown']],
      ['second', 'Express - Cataraqui Centre via Brock/Bath', ['downtown', 'd1', 'd2', 'cataraqui']],
    ]))).toEqual({ first: '0', second: '0' });
  });

  it('keeps a one-way loop the feed also cuts in two at the far end as one direction (Kingston 19, 2027 feed: CIV-1717)', () => {
    // The two halves end where the other starts, but the full loop runs one, then the other, as one trip.
    expect(dirs(run([
      ['loop1', 'Cataraqui Centre', ['cc', 'a', 'b', 'wh', 'c', 'd', 'cc']], ['loop2', 'Cataraqui Centre', ['cc', 'a', 'b', 'wh', 'c', 'd', 'cc']],
      ['back', 'Cataraqui Centre', ['wh', 'c', 'd', 'e', 'cc']],
      ['out', 'Woodhaven', ['cc', 'a', 'b', 'wh']],
    ]))).toEqual({ loop1: '0', loop2: '0', back: '0', out: '0' });
  });

  it('still reads an out-and-back on the same stops as two directions when one trip runs both ways', () => {
    expect(dirs(run([
      ['out1', 'North', ['s', 'a', 'b', 'c', 'n']], ['out2', 'North', ['s', 'a', 'b', 'c', 'n']],
      ['back', 'South', ['n', 'c', 'b', 'a', 's']],
      ['round', 'Round Trip', ['s', 'a', 'b', 'c', 'n', 'c', 'b', 'a', 's']],
    ]))).toEqual({ out1: '0', out2: '0', back: '1', round: '0' });
  });

  it('places a short trip by its stops when its headsign names the end of a trip the other way (Kingston 2, 2027 feed: CIV-1717)', () => {
    // Short trips to the Bus Terminal start from both ends of the route.
    expect(dirs(run([
      ['out1', 'Division Street', ['a', 'b', 'c', 'd', 'e']], ['out2', 'Division Street', ['a', 'b', 'c', 'd', 'e']],
      ['in1', 'Train Station', ['e', 'd2', 'c2', 'b2', 'a']], ['in2', 'Train Station', ['e', 'd2', 'c2', 'b2', 'a']],
      ['inShort1', 'Bus Terminal', ['e', 'd2', 'c2', 't']], ['inShort2', 'Bus Terminal', ['e', 'd2', 'c2', 't']],
      ['outShort', 'Bus Terminal', ['b', 'c', 'd', 't']],
    ]))).toEqual({ out1: '0', out2: '0', in1: '1', in2: '1', inShort1: '1', inShort2: '1', outShort: '0' });
  });

  it('places a short trip by the stops it shares, in order or reversed', () => {
    expect(dirs(run([
      ['east', 'East', ['a', 'b', 'c', 'd', 'e']], ['east2', 'East', ['a', 'b', 'c', 'd', 'e']],
      ['west', 'West', ['e', 'd', 'c', 'b', 'a']],
      ['westShort', 'Somewhere', ['d', 'c', 'b']],
    ]))).toEqual({ east: '0', east2: '0', west: '1', westShort: '1' });
  });

  it('a one-way loop with an early variant stays one direction', () => {
    expect(dirs(run([
      ['day', 'Loop', ['t', 'a', 'b', 'c', 'd', 't']], ['day2', 'Loop', ['t', 'a', 'b', 'c', 'd', 't']],
      ['early', 'Loop', ['a', 'b', 'c', 'd', 't']],
    ]))).toEqual({ day: '0', day2: '0', early: '0' });
  });

  it('gives up when the evidence disagrees or a third pattern fits neither direction (Kingston 16), so the old guess stays', () => {
    // The stops run back the other way, but the headsign names the same place.
    expect(run([['a', 'North', ['x', 'y', 'z', 'w']], ['b', 'North', ['w', 'z', 'y', 'x']]])).toBeNull();
    expect(run([
      ['a', 'North', ['x', 'y', 'z']], ['b', 'South', ['p', 'q', 'r']], ['c', 'Elsewhere', ['m', 'n', 'o']],
    ])).toBeNull();
    expect(run([['a', 'X', ['only']]])).toBeNull();
  });

  it('marks an inferred route as the feed\'s own directions, and an unsure one as synthesized', () => {
    const feed = (stops: Record<string, string[]>, headsigns: Record<string, string>): GtfsData => ({
      agencies: [], routes: [{ route_id: 'r', route_short_name: '1', route_long_name: '', route_type: '3' }],
      trips: Object.keys(stops).map(id => ({ trip_id: id, route_id: 'r', service_id: 'svc', trip_headsign: headsigns[id] })) as GtfsData['trips'],
      stops: [], calendar: [], calendarDates: [], shapes: [], frequencies: [],
      stopTimes: Object.entries(stops).flatMap(([id, list]) => list.map((stop_id, i) => ({ trip_id: id, stop_id, stop_sequence: String(i + 1), arrival_time: '08:00:00', departure_time: '08:00:00' }))),
    });
    const sure = synthesizeMissingDirections(feed({ a: ['x', 'y', 'z'], b: ['z', 'y', 'x'] }, { a: 'Z', b: 'X' }));
    expect(sure.trips.map(t => t.direction_id)).toEqual(['0', '1']);
    expect(sure.inferredDirectionRouteIds?.has('r')).toBe(true);
    expect(sure.synthesizedDirectionRouteIds?.has('r') ?? false).toBe(false);
    const unsure = synthesizeMissingDirections(feed({ a: ['x', 'y', 'z'], b: ['p', 'q', 'r'], c: ['m', 'n', 'o'] }, { a: 'N', b: 'S', c: 'E' }));
    expect(unsure.synthesizedDirectionRouteIds?.has('r')).toBe(true);
    expect(unsure.inferredDirectionRouteIds?.has('r') ?? false).toBe(false);
  });
});
