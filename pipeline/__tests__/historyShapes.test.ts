import { describe, expect, it } from 'vitest';
import {
  HISTORY_SHAPE_DECIMALS, HISTORY_SHAPE_TOLERANCE_M,
  buildPeriodShapes, compileAgencyShapes, extractRouteShapes, prepareShape, shapeHash, type ShapeFeedInput,
} from '../historyShapes.js';
import { shapeForYear } from '../../shared/historyV2Reader.js';

// parseGtfsZip shape points are [lat, lon]; stored lines are [lon, lat].
const feed = (over: Partial<ShapeFeedInput> = {}): ShapeFeedInput => ({
  routes: [{ route_id: 'R1', route_short_name: '1' }],
  trips: [{ route_id: 'R1', trip_id: 't1', direction_id: '0', shape_id: 'A' }],
  shapes: [{ id: 'A', points: [[33.7, -84.4], [33.71, -84.39], [33.72, -84.38]] }],
  stops: [],
  stopTimes: [],
  ...over,
});

describe('extractRouteShapes', () => {
  it('uses shapes.txt via trips.shape_id and flips to [lon, lat]', () => {
    const m = extractRouteShapes(feed());
    expect(m.get('1')).toEqual({ coordinates: [[-84.4, 33.7], [-84.39, 33.71], [-84.38, 33.72]], approximate: false });
  });

  it('picks the shape most trips use, ignoring short turns', () => {
    const m = extractRouteShapes(feed({
      trips: [
        { route_id: 'R1', trip_id: 't1', direction_id: '0', shape_id: 'SHORT' },
        { route_id: 'R1', trip_id: 't2', direction_id: '0', shape_id: 'SHORT' },
        { route_id: 'R1', trip_id: 't3', direction_id: '0', shape_id: 'SHORT' },
        { route_id: 'R1', trip_id: 't4', direction_id: '0', shape_id: 'FULL' },
        { route_id: 'R1', trip_id: 't5', direction_id: '0', shape_id: 'FULL' },
      ],
      shapes: [
        { id: 'SHORT', points: [[33.7, -84.4], [33.701, -84.4]] },
        { id: 'FULL', points: [[33.7, -84.4], [33.75, -84.4]] },
      ],
    }));
    expect(m.get('1')!.coordinates[1]).toEqual([-84.4, 33.75]);
  });

  it('takes direction 0, else the lowest direction that has a shape', () => {
    const m = extractRouteShapes(feed({
      trips: [
        { route_id: 'R1', trip_id: 't0', direction_id: '0' }, // no shape_id
        { route_id: 'R1', trip_id: 't1', direction_id: '1', shape_id: 'A' },
      ],
    }));
    expect(m.get('1')!.approximate).toBe(false);
  });

  it('with no shapes.txt, draws the stop order of the trip serving the most stops, flagged approximate', () => {
    const m = extractRouteShapes(feed({
      trips: [{ route_id: 'R1', trip_id: 'short', direction_id: '0' }, { route_id: 'R1', trip_id: 'long', direction_id: '0' }],
      shapes: [],
      stops: [
        { stop_id: 's1', stop_lat: '33.7', stop_lon: '-84.4' }, { stop_id: 's2', stop_lat: '33.8', stop_lon: '-84.3' },
        { stop_id: 's3', stop_lat: '33.9', stop_lon: '-84.2' },
      ],
      stopTimes: [
        { trip_id: 'short', stop_id: 's1', stop_sequence: '1' }, { trip_id: 'short', stop_id: 's2', stop_sequence: '2' },
        // out of order on purpose: stop_sequence decides, not file order
        { trip_id: 'long', stop_id: 's3', stop_sequence: '3' }, { trip_id: 'long', stop_id: 's1', stop_sequence: '1' }, { trip_id: 'long', stop_id: 's2', stop_sequence: '2' },
      ],
    }));
    expect(m.get('1')).toEqual({ coordinates: [[-84.4, 33.7], [-84.3, 33.8], [-84.2, 33.9]], approximate: true });
  });

  it('a route with no shape and fewer than 2 located stops has no entry', () => {
    const m = extractRouteShapes(feed({
      shapes: [],
      stops: [{ stop_id: 's1', stop_lat: '33.7', stop_lon: '-84.4' }],
      stopTimes: [{ trip_id: 't1', stop_id: 's1', stop_sequence: '1' }, { trip_id: 't1', stop_id: 'missing', stop_sequence: '2' }],
    }));
    expect(m.has('1')).toBe(false);
  });

  it('keys routes like the snapshots do (short name, route_id, long name) and pools route_ids of one key', () => {
    const m = extractRouteShapes(feed({
      routes: [{ route_id: 'A1', route_short_name: '5' }, { route_id: 'A2', route_short_name: '5' }, { route_id: 'RID' }, { route_id: '', route_long_name: 'Blue Line' }],
      trips: [
        { route_id: 'A2', trip_id: 't1', shape_id: 'A' },
        { route_id: 'RID', trip_id: 't2', shape_id: 'A' },
        { route_id: '', trip_id: 't3', shape_id: 'A' },
      ],
    }));
    expect([...m.keys()].sort()).toEqual(['5', 'Blue Line', 'RID']);
  });
});

describe('prepareShape', () => {
  const line = Array.from({ length: 101 }, (_, i) => [-84.4 + i * 0.0001, 33.7 + (i % 2 === 0 ? 0 : 0.00001)]); // ~11 m steps, 1 m wobble
  it('simplifies within the tolerance, keeps both endpoints and rounds', () => {
    const out = prepareShape(line, { toleranceM: 15, decimals: 5 })!;
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual([-84.4, 33.7]);
    expect(out[1][0]).toBeCloseTo(-84.39, 5);
    expect(prepareShape(line, { toleranceM: 0, decimals: 5 })!.length).toBeGreaterThan(50);
    expect(prepareShape([[-84.123456789, 33.987654321], [-84.1, 33.9]], { decimals: 4 })![0]).toEqual([-84.1235, 33.9877]);
  });

  it('keeps a real corner and treats the tolerance in metres at any latitude', () => {
    const corner = [[-84.4, 33.7], [-84.4, 33.71], [-84.39, 33.71]]; // ~1.1 km north then ~0.9 km east
    expect(prepareShape(corner, { toleranceM: 15 })).toHaveLength(3);
    // a 20 m bump survives 15 m but not 40 m, also at 60 degrees north
    const bump = (lat: number) => [[-84.4, lat], [-84.3995, lat + 0.00018], [-84.399, lat]];
    expect(prepareShape(bump(33.7), { toleranceM: 15 })).toHaveLength(3);
    expect(prepareShape(bump(33.7), { toleranceM: 40 })).toHaveLength(2);
    expect(prepareShape(bump(60), { toleranceM: 15 })).toHaveLength(3);
  });

  it('returns null when fewer than 2 distinct vertices remain', () => {
    expect(prepareShape([[-84.4, 33.7]])).toBeNull();
    expect(prepareShape([[-84.4, 33.7], [-84.4000001, 33.7000001]])).toBeNull();
  });

  it('uses the named defaults', () => {
    expect(HISTORY_SHAPE_TOLERANCE_M).toBe(15);
    expect(HISTORY_SHAPE_DECIMALS).toBe(5);
  });
});

describe('compileAgencyShapes', () => {
  const L1 = [[-84.4, 33.7], [-84.3, 33.8]];
  const L2 = [[-84.4, 33.7], [-84.2, 33.9]];
  const period = (periodKey: string, routes: Record<string, { c: number[][]; a?: true }>) =>
    ({ version: 1 as const, slug: 's', periodKey, refDate: periodKey, decimals: 5, toleranceM: 15, routes });

  it('stores an identical line once across years and two different lines twice', () => {
    const periods = new Map([
      ['2014', period('2014', { '1': { c: L1 }, '2': { c: L1 } })],
      ['2015', period('2015', { '1': { c: L1 }, '2': { c: L2 } })],
    ]);
    const { file, stats } = compileAgencyShapes('s', periods, [
      { routeKey: '1', year: 2014, periodKey: '2014' }, { routeKey: '1', year: 2015, periodKey: '2015' },
      { routeKey: '2', year: 2014, periodKey: '2014' }, { routeKey: '2', year: 2015, periodKey: '2015' },
    ]);
    expect(file.shapes).toEqual([L1, L2]);
    expect(file.years).toEqual({ '2014': { '1': 0, '2': 0 }, '2015': { '1': 0, '2': 1 } });
    expect(stats).toMatchObject({ routeYears: 4, withShape: 4, noShape: 0, distinctShapes: 2, reused: 2 });
  });

  it('a route missing a shape in a year is absent and reads as none, never another year', () => {
    const periods = new Map([
      ['2014', period('2014', { '1': { c: L1 } })],
      ['2015', period('2015', {})],
    ]);
    const { file, stats } = compileAgencyShapes('s', periods, [
      { routeKey: '1', year: 2014, periodKey: '2014' }, { routeKey: '1', year: 2015, periodKey: '2015' },
      { routeKey: '1', year: 2016, periodKey: '2016-missing' },
    ]);
    expect(stats).toMatchObject({ withShape: 1, noShape: 2, missingPeriods: ['2016-missing'] });
    expect(shapeForYear(file, '1', 2014).kind).toBe('shape');
    expect(shapeForYear(file, '1', 2015)).toEqual({ kind: 'none' });
    expect(shapeForYear(file, '1', 2016)).toEqual({ kind: 'none' });
  });

  it('marks approximate lines and looks up aliased old keys after the canonical key', () => {
    const periods = new Map([['2014', period('2014', { OLD: { c: L2, a: true } })]]);
    const { file } = compileAgencyShapes('s', periods, [{ routeKey: 'NEW', year: 2014, periodKey: '2014', lookupKeys: ['NEW', 'OLD'] }]);
    expect(shapeForYear(file, 'NEW', 2014)).toMatchObject({ kind: 'shape', approximate: true });
  });

  it('is deterministic whatever the input order and rejects mixed tolerance settings', () => {
    const periods = new Map([['2014', period('2014', { '1': { c: L1 }, '2': { c: L2 } })]]);
    const ry = [{ routeKey: '2', year: 2014, periodKey: '2014' }, { routeKey: '1', year: 2014, periodKey: '2014' }];
    const a = compileAgencyShapes('s', periods, ry).file;
    const b = compileAgencyShapes('s', periods, [...ry].reverse()).file;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const mixed = new Map([['a', period('a', {})], ['b', { ...period('b', {}), toleranceM: 40 }]]);
    expect(() => compileAgencyShapes('s', mixed, [])).toThrow(/different tolerance/);
  });

  it('hashes by content', () => {
    expect(shapeHash(L1)).toBe(shapeHash(L1.map(p => [...p])));
    expect(shapeHash(L1)).not.toBe(shapeHash(L2));
  });

  it('buildPeriodShapes prepares lines and drops routes that collapse', () => {
    const p = buildPeriodShapes('s', 'p', '20140101', new Map([
      ['ok', { coordinates: [[-84.4, 33.7], [-84.3, 33.8]], approximate: false }],
      ['dot', { coordinates: [[-84.4, 33.7], [-84.4000001, 33.7]], approximate: true }],
    ]));
    expect(Object.keys(p.routes)).toEqual(['ok']);
    expect(p).toMatchObject({ version: 1, slug: 's', periodKey: 'p', refDate: '20140101', toleranceM: 15, decimals: 5 });
  });
});
