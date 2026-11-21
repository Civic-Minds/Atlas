import { describe, expect, it } from 'vitest';
import { nameEugeneEmxPatterns } from '../eugene-emx-patterns.js';
import type { GtfsData } from '../../../types/gtfs.js';

// Lane Transit District EmX, 20270130 feed (CIV-2012): eastbound from Willow Creek, one pattern round the Gateway loop by
// RiverBend to Bay C, the other by Pheasant to Bay D, both headed "EmX EUGENE STATION". Westbound starts at either bay and
// ends at Willow Creek. Stop ids and names are the feed's own (shortened to the stops that matter).
const NAMES: Record<string, string> = {
  wc: 'Willow Creek Facility', es: 'Eugene Station, Bay T', hb: 'Hayden Bridge Station Inbound',
  rb: 'RiverBend Station_counter-clockwise', sh: 'Sacred Heart Station_counter-clockwise', bc: 'Gateway Sta.-Bay C (EmX to SS)',
  ph: 'Pheasant Station_clockwise', gl: 'Guy Lee Station_clockwise', bd: 'Gateway Sta.-Bay D (EmX to RB)',
  rbw: 'RiverBend Station_clockwise', phw: 'Pheasant Station_counter-clockwise', esw: 'Eugene Station, Bay U',
};
const EAST_RB = ['wc', 'es', 'rb', 'sh', 'bc'];
const EAST_PH = ['wc', 'es', 'ph', 'gl', 'bd'];
const WEST_RB = ['bd', 'rbw', 'hb', 'esw', 'wc'];
const WEST_PH = ['bc', 'phw', 'hb', 'esw', 'wc'];
const EAST = 'EmX EUGENE STATION';
const WEST = '103 EmX WEST 11TH <> COMMERCE STATION';
const trip = (trip_id: string, direction_id: string, trip_headsign: string, route_id = '103') => ({ route_id, service_id: 'wk', trip_id, direction_id, trip_headsign });
const times = (trip_id: string, stops: string[]) =>
  stops.map((stop_id, i) => ({ trip_id, stop_id, stop_sequence: String(i + 1), arrival_time: '07:00:00', departure_time: '07:00:00' }));
const feed = (trips: ReturnType<typeof trip>[], stopTimes: ReturnType<typeof times>, shortName = 'EmX'): GtfsData => ({
  agencies: [], routes: [{ route_id: '103', route_short_name: shortName, route_long_name: 'EmX', route_type: '3' }, { route_id: '11', route_short_name: '11', route_long_name: '', route_type: '3' }],
  stops: Object.entries(NAMES).map(([stop_id, stop_name]) => ({ stop_id, stop_name })), calendar: [], calendarDates: [], shapes: [], trips, stopTimes,
} as unknown as GtfsData);
const today = () => feed(
  [trip('e1', '0', EAST), trip('e2', '0', EAST), trip('e3', '0', EAST), trip('w1', '1', WEST), trip('w2', '1', WEST)],
  [...times('e1', EAST_RB), ...times('e2', EAST_PH), ...times('e3', EAST_RB), ...times('w1', WEST_RB), ...times('w2', WEST_PH)],
);

describe('EmX patterns of one headsign that end at different stops (CIV-2012)', () => {
  it('names each eastbound pattern from the feed\'s stop names: the terminal up to the bay, via the first stop only it serves', () => {
    const { gtfs, renamed } = nameEugeneEmxPatterns(today());
    expect(renamed).toEqual({ 'Gateway Sta. via RiverBend Station': 2, 'Gateway Sta. via Pheasant Station': 1 });
    expect(gtfs.trips.map(t => t.trip_headsign)).toEqual([
      'Gateway Sta. via RiverBend Station', 'Gateway Sta. via Pheasant Station', 'Gateway Sta. via RiverBend Station', WEST, WEST,
    ]);
  });

  it('leaves westbound (two starts, one end) and every other route as published', () => {
    const { gtfs } = nameEugeneEmxPatterns(today());
    expect(gtfs.trips.filter(t => t.direction_id === '1').map(t => t.trip_headsign)).toEqual([WEST, WEST]);
    const other = feed([trip('a', '0', EAST, '11'), trip('b', '0', EAST, '11')], [...times('a', EAST_RB), ...times('b', EAST_PH)]);
    expect(nameEugeneEmxPatterns(other).gtfs).toBe(other);
  });

  it('leaves the feed alone when the two ends are different terminals, or a pattern has no stop of its own', () => {
    const otherEnd = feed([trip('e1', '0', EAST), trip('e2', '0', EAST)], [...times('e1', EAST_RB), ...times('e2', ['wc', 'es', 'ph', 'gl', 'esw'])]);
    expect(nameEugeneEmxPatterns(otherEnd).gtfs).toBe(otherEnd);
    const noOwnStop = feed([trip('e1', '0', EAST), trip('e2', '0', EAST)], [...times('e1', ['wc', 'es', 'bc']), ...times('e2', ['wc', 'es', 'bd'])]);
    expect(nameEugeneEmxPatterns(noOwnStop).gtfs).toBe(noOwnStop);
    const noEmx = feed([trip('e1', '0', EAST), trip('e2', '0', EAST)], [...times('e1', EAST_RB), ...times('e2', EAST_PH)], '103');
    expect(nameEugeneEmxPatterns(noEmx).reason).toBe('no EmX route in the feed');
  });
});
