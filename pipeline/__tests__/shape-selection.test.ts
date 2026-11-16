import { describe, expect, it } from 'vitest';
import type { GtfsData, GtfsRoute } from '../../types/gtfs.js';
import type { GeoJsonFeature } from '../geojson-types.js';
import { buildShapeSelectionContext, annotateShortTurnVariants, joinsAsLeg } from '../shape-selection.js';
import { resolveDisplayHeadsign } from '../../shared/headsignDisplay.js';

function shape(id: string): { id: string; points: [number, number][] } {
  return { id, points: [[43, -79], [43.01, -79.01]] };
}

function routeFeature(routeId: string, directionId: string): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [] },
    properties: { routeId, directionId, routeShortName: '10', routeLongName: null },
  };
}

describe('buildShapeSelectionContext', () => {
  it('chooses a representative headsign shape from the feature day type', () => {
    const route: GtfsRoute = { route_id: 'r194', route_short_name: '194', route_type: '3' };
    const trips = [
      ...Array.from({ length: 4 }, (_, i) => ({ route_id: 'r194', service_id: 'weekday', trip_id: `wd-a-${i}`, trip_headsign: '194 NEW YORK', direction_id: '0', shape_id: 'weekday-a' })),
      { route_id: 'r194', service_id: 'weekday', trip_id: 'wd-b', trip_headsign: '194 NEW YORK', direction_id: '0', shape_id: 'weekday-b' },
      ...Array.from({ length: 8 }, (_, i) => ({ route_id: 'r194', service_id: 'saturday', trip_id: `sat-${i}`, trip_headsign: '194 NEW YORK', direction_id: '0', shape_id: 'saturday' })),
    ];
    const gtfs = {
      agencies: [], routes: [route], trips, stops: [], stopTimes: [], calendar: [], calendarDates: [],
      shapes: [shape('weekday-a'), shape('weekday-b'), shape('saturday')],
    } as unknown as GtfsData;
    const routeById = new Map([['r194', route]]);
    const activeServiceIds = new Set(['weekday', 'saturday']);
    const activeServiceIdsByDay = new Map([
      ['Weekday', new Set(['weekday'])], ['Saturday', new Set(['saturday'])], ['Sunday', new Set<string>()],
    ] as const);

    const context = buildShapeSelectionContext(gtfs, routeById, activeServiceIds, activeServiceIdsByDay);

    expect(context.headsignDisplayShape.get('r194::0::194 NEW YORK')).toBe('saturday');
    expect(context.headsignDisplayShapeByDay.get('r194::0::194 NEW YORK::Weekday')).toMatch(/^weekday-/);
    expect(context.headsignDisplayShapeByDay.get('r194::0::194 NEW YORK::Saturday')).toBe('saturday');
  });
});

describe('phase 1 shape filter by day type (CIV-1718, #1543)', () => {
  const line = (id: string, km: number) => ({ id, points: [[43, -79], [43 + km / 111, -79]] as [number, number][] });
  const route: GtfsRoute = { route_id: 'r30', route_short_name: '30', route_type: '3' };
  const byDay = new Map([
    ['Weekday', new Set(['wd'])], ['Saturday', new Set(['sat'])], ['Sunday', new Set(['sun'])],
  ] as const);
  const build = (trips: object[], shapes: { id: string; points: [number, number][] }[]) => buildShapeSelectionContext(
    { agencies: [], routes: [route], trips, stops: [], stopTimes: [], calendar: [], calendarDates: [], shapes } as unknown as GtfsData,
    new Map([['r30', route]]), new Set(['wd', 'sat', 'sun']), byDay,
  );
  const trips = (n: number, service: string, shapeId: string) => Array.from({ length: n }, (_, i) => (
    { route_id: 'r30', service_id: service, trip_id: `${service}-${shapeId}-${i}`, trip_headsign: 'Loop', direction_id: '0', shape_id: shapeId }));

  it("keeps a weekday-only loop that loses the all-days count to a weekend half (Medicine Hat 30)", () => {
    const ctx = build([...trips(8, 'wd', 'loop'), ...trips(15, 'sat', 'half'), ...trips(15, 'sun', 'half')], [line('loop', 10), line('half', 5)]);
    expect(ctx.shapeFilterForPhase1.get('r30::0::Loop')).toEqual(new Set(['half', 'loop']));
    expect(ctx.shapeFilterForPhase1.get('r30::0')).toEqual(new Set(['half', 'loop']));
  });

  it('leaves a day split between two legs as before (Barrie 8A Sunday)', () => {
    const ctx = build(
      [...trips(20, 'wd', 'main'), ...trips(13, 'sun', 'leg-a'), ...trips(13, 'sun', 'leg-b')],
      [line('main', 30), line('leg-a', 10), line('leg-b', 20)],
    );
    expect(ctx.shapeFilterForPhase1.get('r30::0::Loop')).toEqual(new Set(['main']));
  });

  it('lists the shapes a headsign gets only from a day pick (CIV-1720)', () => {
    const hs = (n: number, service: string, shapeId: string, headsign: string) => trips(n, service, shapeId)
      .map(t => ({ ...t, trip_id: `${t.trip_id}-${headsign}`, trip_headsign: headsign }));
    const ctx = build(
      [...hs(20, 'wd', 'main', 'Loop'), ...hs(10, 'sun', 'main', 'Loop'), ...hs(10, 'wd', 'b-main', 'Branch'), ...hs(5, 'sun', 'b-short', 'Branch')],
      [line('main', 10), line('b-main', 10), line('b-short', 4)],
    );
    expect(ctx.shapeFilterForPhase1.get('r30::0::Branch')).toEqual(new Set(['b-main', 'b-short']));
    expect(ctx.dayPickShapes.get('r30::0::Branch')).toEqual(new Set(['b-short']));
    expect(ctx.dayPickShapes.has('r30::0::Loop')).toBe(false);
  });

  it('reads both legs of a route run in two legs that meet at one stop (Barrie 8A Sunday, CIV-1719)', () => {
    const all = [...trips(20, 'wd', 'main'), ...trips(13, 'sun', 'leg-a'), ...trips(13, 'sun', 'leg-b'), ...trips(13, 'sun', 'short')];
    const stopsOf: Record<string, string[]> = {
      main: ['s1', 's2', 's3', 'hub', 's5', 's6', 's7'],
      'leg-a': ['s1', 's2', 's3', 'hub'], 'leg-b': ['hub', 's5', 's6', 's7'], short: ['s1', 's2', 's3'],
    };
    const stopTimes = (keep: string[]) => all.filter(t => keep.includes(t.shape_id)).flatMap(t => stopsOf[t.shape_id].map((stop_id, i) => ({ trip_id: t.trip_id, stop_id, stop_sequence: String(i + 1) })));
    const ctxOf = (sunday: string[]) => buildShapeSelectionContext(
      { agencies: [], routes: [route], trips: all.filter(t => t.service_id === 'wd' || sunday.includes(t.shape_id)), stops: [], stopTimes: stopTimes(['main', ...sunday]), calendar: [], calendarDates: [],
        shapes: [line('main', 30), line('leg-a', 20), line('leg-b', 10), line('short', 10)] } as unknown as GtfsData,
      new Map([['r30', route]]), new Set(['wd', 'sat', 'sun']), byDay,
    );
    expect(ctxOf(['leg-a', 'leg-b']).shapeFilterForPhase1.get('r30::0::Loop')).toEqual(new Set(['main', 'leg-a', 'leg-b']));
    // A short turn is not a leg: it shares the main pattern's stops.
    expect(ctxOf(['leg-a', 'short']).shapeFilterForPhase1.get('r30::0::Loop')).toEqual(new Set(['main']));
  });

  it('still drops a short turn on a day the main shape serves', () => {
    const ctx = build([...trips(20, 'wd', 'main'), ...trips(5, 'wd', 'short'), ...trips(10, 'sat', 'main')], [line('main', 10), line('short', 5)]);
    expect(ctx.shapeFilterForPhase1.get('r30::0::Loop')).toEqual(new Set(['main']));
  });
});

describe('joinsAsLeg (CIV-1719)', () => {
  it('joins two shapes that meet at one stop, in either order', () => {
    expect(joinsAsLeg(['a', 'b', 'hub'], ['hub', 'c', 'd'])).toBe(true);
    expect(joinsAsLeg(['hub', 'c', 'd'], ['a', 'b', 'hub'])).toBe(true);
  });
  it('refuses a short turn, an out-and-back and shapes that share a stretch', () => {
    expect(joinsAsLeg(['a', 'b', 'c', 'd'], ['a', 'b', 'c'])).toBe(false);
    expect(joinsAsLeg(['a', 'b', 'c'], ['c', 'x', 'a'])).toBe(false);
    expect(joinsAsLeg(['a', 'b', 'c', 'hub'], ['hub', 'b', 'c', 'e'])).toBe(false);
  });
});

describe('annotateShortTurnVariants', () => {
  it('surfaces short-turn variants for direction 1, not just direction 0 (#470)', () => {
    // Both directions have the same shape: a dominant 80-trip shape plus a
    // 20-trip (20% share) short-turn shape with a different headsign.
    const shapeCounts = new Map([
      ['r1::0', new Map([['main-0', 80], ['short-0', 20]])],
      ['r1::1', new Map([['main-1', 80], ['short-1', 20]])],
    ]);
    const headsignShapeCounts = new Map([
      ['r1::0::Main St', new Map([['main-0', 80]])],
      ['r1::0::Short Turn', new Map([['short-0', 20]])],
      ['r1::1::Main St', new Map([['main-1', 80]])],
      ['r1::1::Short Turn', new Map([['short-1', 20]])],
    ]);
    const routeDirToAnalysisShapes = new Map([
      ['r1::0', new Set(['main-0'])],
      ['r1::1', new Set(['main-1'])],
    ]);

    const features = [routeFeature('r1', '0'), routeFeature('r1', '1')];
    annotateShortTurnVariants(features, { shapeCounts, headsignShapeCounts, routeDirToAnalysisShapes });

    const expectedHeadsign = resolveDisplayHeadsign('Short Turn', '10', null);
    expect(features[0].properties.shortTurnVariants).toEqual([{ headsign: expectedHeadsign, tripShare: 20 }]);
    expect(features[1].properties.shortTurnVariants).toEqual([{ headsign: expectedHeadsign, tripShare: 20 }]);
  });

  it('leaves a direction with no minority shape unannotated', () => {
    const shapeCounts = new Map([['r1::0', new Map([['main-0', 100]])]]);
    const headsignShapeCounts = new Map([['r1::0::Main St', new Map([['main-0', 100]])]]);
    const routeDirToAnalysisShapes = new Map([['r1::0', new Set(['main-0'])]]);

    const features = [routeFeature('r1', '0')];
    annotateShortTurnVariants(features, { shapeCounts, headsignShapeCounts, routeDirToAnalysisShapes });

    expect(features[0].properties.shortTurnVariants).toBeUndefined();
  });
});
