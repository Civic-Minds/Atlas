import { describe, expect, it } from 'vitest';
import type { GtfsData } from '../../types/gtfs';
import { synthesizeTripHeadsigns } from '../synthesize-directions';

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
});
