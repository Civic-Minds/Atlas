import { describe, expect, it } from 'vitest';
import type { GtfsData, GtfsStopTime } from '../../types/gtfs';
import { interpolateUntimedStops } from '../transforms/interpolate-untimed-stops';

const st = (seq: number, time: string, dist?: number): GtfsStopTime => ({
  trip_id: 't1', stop_id: `s${seq}`, stop_sequence: String(seq), arrival_time: time, departure_time: time,
  shape_dist_traveled: dist == null ? undefined : String(dist),
});
const run = (stopTimes: GtfsStopTime[]) => interpolateUntimedStops({ stopTimes } as GtfsData);

// #753: Amarillo times only its timepoints; the other stops need interpolated times.
describe('interpolateUntimedStops', () => {
  it('fills untimed stops between timepoints by distance travelled', () => {
    const { gtfs, filled } = run([st(1, '07:00:00', 0), st(2, '', 1), st(3, '', 3), st(4, '07:10:00', 4)]);
    expect(filled).toBe(2);
    expect(gtfs.stopTimes.map(s => s.departure_time)).toEqual(['07:00:00', '07:02:30', '07:07:30', '07:10:00']);
  });

  it('falls back to stop order without usable distances, and past midnight', () => {
    const { gtfs } = run([st(1, '24:50:00'), st(2, ''), st(3, ''), st(4, '25:20:00')]);
    expect(gtfs.stopTimes.map(s => s.arrival_time)).toEqual(['24:50:00', '25:00:00', '25:10:00', '25:20:00']);
  });

  it('leaves stops before the first and after the last timepoint blank', () => {
    const { gtfs, filled } = run([st(1, ''), st(2, '08:00:00'), st(3, '08:05:00'), st(4, '')]);
    expect(filled).toBe(0);
    expect(gtfs.stopTimes.map(s => s.departure_time)).toEqual(['', '08:00:00', '08:05:00', '']);
  });
});
