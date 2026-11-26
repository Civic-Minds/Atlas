import { describe, expect, it } from 'vitest';
import { dropFeedSeconds } from '../parseGtfs';
import { t2m } from '../transit-utils';
import type { GtfsData } from '../../types/gtfs';

// #1824 (CIV-2959): TTC Line 4 runs every 5:30 and read "every 5" in whole minutes. Only the routes an agency config
// lists in `secondsRoutes` keep their seconds; every other time reads whole minutes, as before.
const feed = (): Partial<GtfsData> => ({
  routes: [{ route_id: 'r4', route_short_name: '4' }, { route_id: 'r504', route_short_name: '504' }] as GtfsData['routes'],
  trips: [{ trip_id: 'a', route_id: 'r4' }, { trip_id: 'b', route_id: 'r504' }] as GtfsData['trips'],
  stopTimes: [
    { trip_id: 'a', stop_id: 's', stop_sequence: '1', arrival_time: '20:05:30', departure_time: '20:05:30' },
    { trip_id: 'b', stop_id: 's', stop_sequence: '1', arrival_time: '20:05:45', departure_time: '20:05:45' },
  ] as GtfsData['stopTimes'],
  frequencies: [{ trip_id: 'b', start_time: '06:00:30', end_time: '09:00:30', headway_secs: '600' }] as GtfsData['frequencies'],
});

describe('secondsRoutes (#1824)', () => {
  it('keeps seconds only on listed routes', () => {
    const g = feed();
    dropFeedSeconds(g, ['4']);
    expect(g.stopTimes!.map(s => s.departure_time)).toEqual(['20:05:30', '20:05:00']);
    expect(g.frequencies![0]).toMatchObject({ start_time: '06:00:00', end_time: '09:00:00' });
    expect(t2m(g.stopTimes![0].departure_time!)).toBe(20 * 60 + 5.5);
  });

  it('reads every time in whole minutes without a list, as main always has', () => {
    const g = feed();
    dropFeedSeconds(g, undefined);
    expect(g.stopTimes!.map(s => t2m(s.departure_time!))).toEqual([1205, 1205]);
    expect(t2m('8:05')).toBe(485);
  });
});
