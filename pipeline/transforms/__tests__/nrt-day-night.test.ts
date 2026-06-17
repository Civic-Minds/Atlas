import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../../types/gtfs';
import { mergeNrtDayNightRoutes } from '../nrt-day-night';

function minimalGtfs(overrides: Partial<GtfsData> = {}): GtfsData {
  return {
    agencies: [{ agency_name: 'NRT' }],
    routes: [],
    trips: [],
    stops: [],
    stopTimes: [],
    calendar: [],
    calendarDates: [],
    shapes: [],
    ...overrides,
  };
}

describe('mergeNrtDayNightRoutes', () => {
  it('reassigns 4xx trips to 3xx and drops evening routes', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: 'r301', route_short_name: '301', route_long_name: 'Hospital', route_type: '3' },
        { route_id: 'r401', route_short_name: '401', route_long_name: 'Hospital', route_type: '3' },
      ],
      trips: [
        { trip_id: 't1', route_id: 'r301', service_id: 'wd' },
        { trip_id: 't2', route_id: 'r401', service_id: 'ev' },
      ],
    });

    const { gtfs: out, result } = mergeNrtDayNightRoutes(gtfs);

    expect(result.mergedPairs).toHaveLength(1);
    expect(result.tripsReassigned).toBe(1);
    expect(result.shapeWarnings).toEqual([]);
    expect(out.routes).toHaveLength(1);
    expect(out.routes[0].route_short_name).toBe('301');
    expect(out.trips.every(t => t.route_id === 'r301')).toBe(true);
  });

  it('skips pairs with mismatched long names', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: 'r301', route_short_name: '301', route_long_name: 'Hospital', route_type: '3' },
        { route_id: 'r401', route_short_name: '401', route_long_name: 'Other St.', route_type: '3' },
      ],
      trips: [{ trip_id: 't1', route_id: 'r401', service_id: 'ev' }],
    });

    const { gtfs: out, result } = mergeNrtDayNightRoutes(gtfs);

    expect(result.mergedPairs).toHaveLength(0);
    expect(result.orphanEveRoutes).toContain('401');
    expect(out.routes).toHaveLength(2);
    expect(out.trips[0].route_id).toBe('r401');
  });

  it('merges when evening long name is a shortened corridor label', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: 'r304', route_short_name: '304', route_long_name: 'Oakdale Av. - Pen Centre', route_type: '3' },
        { route_id: 'r404', route_short_name: '404', route_long_name: 'Oakdale Av.', route_type: '3' },
      ],
      trips: [{ trip_id: 't1', route_id: 'r404', service_id: 'ev' }],
    });

    const { gtfs: out, result } = mergeNrtDayNightRoutes(gtfs);
    expect(result.mergedPairs).toHaveLength(1);
    expect(out.trips[0].route_id).toBe('r304');
  });

  it('leaves non-paired 4xx routes untouched', () => {
    const gtfs = minimalGtfs({
      routes: [{ route_id: 'r499', route_short_name: '499', route_long_name: 'Orphan', route_type: '3' }],
      trips: [{ trip_id: 't1', route_id: 'r499', service_id: 'ev' }],
    });

    const { result } = mergeNrtDayNightRoutes(gtfs);
    expect(result.orphanEveRoutes).toContain('499');
    expect(result.mergedPairs).toHaveLength(0);
  });
});
