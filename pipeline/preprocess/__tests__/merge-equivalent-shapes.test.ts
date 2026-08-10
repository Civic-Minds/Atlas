import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../../types/gtfs.js';
import { mergeEquivalentShapeVariants } from '../merge-equivalent-shapes.js';

const baseShape = {
  id: 'platform-1',
  points: [[33.378556, -112.073266], [33.575095, -112.118471]] as [number, number][],
};

describe('mergeEquivalentShapeVariants', () => {
  it('merges same-path light-rail platform variants within one headsign group', () => {
    const gtfs = {
      agencies: [],
      routes: [{ route_id: 'B', route_type: '0', route_short_name: 'B' }],
      trips: [
        { route_id: 'B', direction_id: '0', trip_id: 'p1', trip_headsign: 'Metro Pkwy', shape_id: 'platform-1', service_id: 'weekday' },
        { route_id: 'B', direction_id: '0', trip_id: 'p2', trip_headsign: 'Metro Pkwy', shape_id: 'platform-2', service_id: 'weekday' },
      ],
      stops: [], stopTimes: [], calendar: [], calendarDates: [],
      shapes: [
        baseShape,
        { ...baseShape, id: 'platform-2', points: [[33.378556, -112.073266], [33.575095, -112.118472]] },
      ],
    } as unknown as GtfsData;

    const result = mergeEquivalentShapeVariants(gtfs);

    expect(result.mergedGroups).toBe(1);
    expect(result.mergedTrips).toBe(1);
    expect(result.gtfs.trips.map(trip => trip.shape_id)).toEqual(['platform-1', 'platform-1']);
  });

  it('does not merge different headsigns or non-light-rail routes', () => {
    const gtfs = {
      agencies: [],
      routes: [
        { route_id: 'B', route_type: '0', route_short_name: 'B' },
        { route_id: 'bus', route_type: '3', route_short_name: 'B' },
      ],
      trips: [
        { route_id: 'B', direction_id: '0', trip_id: 'rail-1', trip_headsign: 'Metro Pkwy', shape_id: 'platform-1', service_id: 'weekday' },
        { route_id: 'B', direction_id: '0', trip_id: 'rail-2', trip_headsign: 'Downtown', shape_id: 'platform-2', service_id: 'weekday' },
        { route_id: 'bus', direction_id: '0', trip_id: 'bus-1', trip_headsign: 'Metro Pkwy', shape_id: 'platform-1', service_id: 'weekday' },
        { route_id: 'bus', direction_id: '0', trip_id: 'bus-2', trip_headsign: 'Metro Pkwy', shape_id: 'platform-2', service_id: 'weekday' },
      ],
      stops: [], stopTimes: [], calendar: [], calendarDates: [],
      shapes: [
        baseShape,
        { ...baseShape, id: 'platform-2', points: [[33.378556, -112.073266], [33.575095, -112.118472]] },
      ],
    } as unknown as GtfsData;

    const result = mergeEquivalentShapeVariants(gtfs);

    expect(result.mergedGroups).toBe(0);
    expect(result.mergedTrips).toBe(0);
    expect(result.gtfs.trips.map(trip => trip.shape_id)).toEqual([
      'platform-1', 'platform-2', 'platform-1', 'platform-2',
    ]);
  });
});
