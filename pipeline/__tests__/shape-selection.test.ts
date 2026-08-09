import { describe, expect, it } from 'vitest';
import type { GtfsData, GtfsRoute } from '../../types/gtfs.js';
import { buildShapeSelectionContext } from '../shape-selection.js';

function shape(id: string): { id: string; points: [number, number][] } {
  return { id, points: [[43, -79], [43.01, -79.01]] };
}

describe('buildShapeSelectionContext', () => {
  it('chooses a representative headsign shape from the feature day type', () => {
    const route: GtfsRoute = {
      route_id: 'r194',
      route_short_name: '194',
      route_type: '3',
    };
    const trips = [
      ...Array.from({ length: 4 }, (_, i) => ({
        route_id: 'r194', service_id: 'weekday', trip_id: `wd-a-${i}`,
        trip_headsign: '194 NEW YORK', direction_id: '0', shape_id: 'weekday-a',
      })),
      {
        route_id: 'r194', service_id: 'weekday', trip_id: 'wd-b',
        trip_headsign: '194 NEW YORK', direction_id: '0', shape_id: 'weekday-b',
      },
      ...Array.from({ length: 8 }, (_, i) => ({
        route_id: 'r194', service_id: 'saturday', trip_id: `sat-${i}`,
        trip_headsign: '194 NEW YORK', direction_id: '0', shape_id: 'saturday',
      })),
    ];
    const gtfs = {
      agencies: [], routes: [route], trips, stops: [], stopTimes: [],
      calendar: [], calendarDates: [],
      shapes: [shape('weekday-a'), shape('weekday-b'), shape('saturday')],
    } as unknown as GtfsData;
    const routeById = new Map([['r194', route]]);
    const activeServiceIds = new Set(['weekday', 'saturday']);
    const activeServiceIdsByDay = new Map([
      ['Weekday', new Set(['weekday'])],
      ['Saturday', new Set(['saturday'])],
      ['Sunday', new Set<string>()],
    ] as const);

    const context = buildShapeSelectionContext(
      gtfs,
      routeById,
      activeServiceIds,
      activeServiceIdsByDay,
    );

    expect(context.headsignDisplayShape.get('r194::0::194 NEW YORK')).toBe('saturday');
    expect(context.headsignDisplayShapeByDay.get('r194::0::194 NEW YORK::Weekday')).toMatch(/^weekday-/);
    expect(context.headsignDisplayShapeByDay.get('r194::0::194 NEW YORK::Saturday')).toBe('saturday');
  });
});
