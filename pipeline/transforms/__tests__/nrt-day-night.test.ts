import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../../types/gtfs';
import { mergeNrtDayNightRoutes, sanitizeNrtFeed } from '../nrt-day-night';

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
    expect(result.shortTurnTripsDropped).toBe(0);
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

  it('drops NRT 209/216 auxiliary trips with three or fewer stops', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: 'r209', route_short_name: '209', route_long_name: 'Thorold Stone', route_type: '3' },
        { route_id: 'r216', route_short_name: '216', route_long_name: "Lundy's Ln.", route_type: '3' },
      ],
      trips: [
        { trip_id: 'short209', route_id: 'r209', service_id: 'wd' },
        { trip_id: 'full209', route_id: 'r209', service_id: 'wd' },
        { trip_id: 'short216', route_id: 'r216', service_id: 'wd' },
      ],
      stopTimes: [
        { trip_id: 'short209', arrival_time: '18:00:00', departure_time: '18:00:00', stop_id: 'a', stop_sequence: '1' },
        { trip_id: 'short209', arrival_time: '18:02:00', departure_time: '18:02:00', stop_id: 'b', stop_sequence: '2' },
        { trip_id: 'full209', arrival_time: '18:00:00', departure_time: '18:00:00', stop_id: 'a', stop_sequence: '1' },
        { trip_id: 'full209', arrival_time: '18:15:00', departure_time: '18:15:00', stop_id: 'b', stop_sequence: '2' },
        { trip_id: 'full209', arrival_time: '18:30:00', departure_time: '18:30:00', stop_id: 'c', stop_sequence: '3' },
        { trip_id: 'full209', arrival_time: '18:45:00', departure_time: '18:45:00', stop_id: 'd', stop_sequence: '4' },
        { trip_id: 'short216', arrival_time: '19:00:00', departure_time: '19:00:00', stop_id: 'e', stop_sequence: '1' },
        { trip_id: 'short216', arrival_time: '19:04:00', departure_time: '19:04:00', stop_id: 'f', stop_sequence: '2' },
        { trip_id: 'short216', arrival_time: '19:08:00', departure_time: '19:08:00', stop_id: 'g', stop_sequence: '3' },
      ],
    });

    const { gtfs: out, result } = mergeNrtDayNightRoutes(gtfs);
    expect(result.shortTurnTripsDropped).toBe(2);
    expect(out.trips.map(t => t.trip_id)).toEqual(['full209']);
    expect(out.stopTimes.every(st => st.trip_id === 'full209')).toBe(true);
  });

  it('preserves published day/night route numbers during cleanup', () => {
    const gtfs = minimalGtfs({
      routes: [
        { route_id: 'r316', route_short_name: '316', route_long_name: 'Brock - Glenridge', route_type: '3' },
        { route_id: 'r416', route_short_name: '416', route_long_name: 'Brock - Glenridge', route_type: '3' },
      ],
      trips: [
        { trip_id: 'day', route_id: 'r316', service_id: 'wd' },
        { trip_id: 'night', route_id: 'r416', service_id: 'night' },
      ],
    });

    const { gtfs: out, result } = sanitizeNrtFeed(gtfs);
    expect(result.shortTurnTripsDropped).toBe(0);
    expect(out.routes.map(r => r.route_short_name)).toEqual(['316', '416']);
    expect(out.trips.map(t => t.route_id)).toEqual(['r316', 'r416']);
  });
});
