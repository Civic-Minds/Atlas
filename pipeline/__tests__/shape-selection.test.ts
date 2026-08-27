import { describe, expect, it } from 'vitest';
import type { GtfsData, GtfsRoute } from '../../types/gtfs.js';
import type { GeoJsonFeature } from '../geojson-types.js';
import { buildShapeSelectionContext, annotateShortTurnVariants } from '../shape-selection.js';
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
