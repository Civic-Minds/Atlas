import { describe, expect, it } from 'vitest';
import { directionStretches, rollupDirection, type DirectionTrip } from '../tripSets';

// #1256: Pace 542 on weekdays, direction 0 (GTFS 2026-11-01). A 22-trip pattern from 542s0200 runs every
// 30, but a 6-trip pattern from 542s0285 takes the 7:14, 7:50, 8:25, 14:02, 15:03 and 17:29 slots. The two
// share their last 4 stops to 542n0001. Read alone, the 22-trip pattern has an hour's hole in every period
// and was not regular; only the 6-trip pattern was, so the main stretch was its 14 stops, 10 of them served
// by 6 trips.
const coords = new Map<string, [number, number]>();
const line = (prefix: string, n: number, lat0: number, lon0: number, dLat: number, dLon: number) =>
  Array.from({ length: n }, (_, i) => { const id = `${prefix}${i}`; coords.set(id, [lat0 + i * dLat, lon0 + i * dLon]); return id; });
const ownA = line('a', 12, 41.80, -87.90, 0.004, 0);   // the every-30 pattern's own road
const ownB = line('b', 10, 41.80, -87.85, 0.004, 0);   // the 6-trip pattern's own road
const shared = line('s', 3, 41.85, -87.88, 0, 0.004);
const end = line('e', 1, 41.85, -87.86, 0, 0);
const coord = (id: string) => coords.get(id);

const hm = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
function trips(name: string, stops: readonly string[], departures: readonly string[]): DirectionTrip[] {
  return departures.map((dep, n) => ({ tripId: `${name}${n}`, visits: stops.map((stopId, i) => ({ stopId, minutes: hm(dep) + 2 * i })) }));
}
// Each pattern leaves its first stop so that it reaches the shared stops on its own slot.
const every30 = trips('a', [...ownA, ...shared, ...end], ['6:12', '6:40', '8:56', '9:26', '9:56', '10:26', '10:56', '11:26', '11:56', '12:25', '12:55', '13:25', '14:25', '15:25', '15:56', '16:25', '16:55', '17:55', '18:25', '18:55', '19:25', '19:55']);
const sixTrips = trips('b', [...ownB, ...shared, ...end], ['7:18', '7:54', '8:29', '14:06', '15:07', '17:33']);

describe('patterns that alternate trips where they meet (#1256)', () => {
  it('Pace 542: both are regular, and the main stretch is the stops they share', () => {
    const d = directionStretches('pace542', [...every30, ...sixTrips], coord);
    expect(d.regularPatternCount).toBe(2);
    expect(d.main!.stops).toEqual([...shared, ...end]);
    expect(d.main!.tripCount).toBe(28);
  });

  it('Pace 542: the main stretch reads every 30 at midday', () => {
    const r = rollupDirection(directionStretches('pace542', [...every30, ...sixTrips], coord))!;
    expect(r.period.midday.filterValue).toBe(30);
  });

  it('MATA 30 on Saturdays: two routings every 4 hours, alternating, read every 2 hours where they meet', () => {
    const routeX = trips('x', [...ownA, ...shared, ...end], ['8:15', '12:15', '16:15']);
    // Its road is two stops shorter, so it leaves 4 minutes later to reach the shared stops on the 2-hour beat.
    const routeY = trips('y', [...ownB, ...shared, ...end], ['10:19', '14:19', '18:19']);
    const d = directionStretches('mata30', [...routeX, ...routeY], coord);
    expect(d.regularPatternCount).toBe(2);
    expect(d.main!.stops).toEqual([...shared, ...end]);
    expect(rollupDirection(d)!.period.midday.filterValue).toBe(120);
  });

  it('not with a real branch that runs steadily on its own: the branch stays the main stretch', () => {
    const branch = trips('b', [...ownB, ...shared, ...end], Array.from({ length: 14 }, (_, n) => `${6 + n}:03`));
    const d = directionStretches('branch', [...every30, ...branch], coord);
    expect(d.regularPatternCount).toBe(1);
    expect(d.main!.stops).toEqual([...ownB, ...shared, ...end]);
  });

  it('not when the busiest pattern is steady itself (a peak-only branch beside it stays a variant, Pace 808)', () => {
    const allDay = trips('a', [...ownA, ...shared, ...end], ['6:12', '6:42', '7:12', '7:42', '8:12', '8:42', '9:12', '9:42', '10:12', '10:42', '11:12', '11:42', '12:12', '12:42', '13:12', '13:42', '14:12', '14:42', '15:12', '15:42', '16:12', '16:42', '17:12']);
    const peakOnly = trips('b', [...ownB, ...shared, ...end], ['7:27', '7:57', '8:27', '16:27', '16:57']);
    const d = directionStretches('peak', [...allDay, ...peakOnly], coord);
    expect(d.regularPatternCount).toBe(1);
    expect(d.main!.stops).toEqual([...ownA, ...shared, ...end]);
  });

  it('not when the two end at different terminals', () => {
    const elsewhere = line('z', 1, 41.95, -87.70, 0, 0);
    const offEnd = trips('b', [...ownB, ...shared, ...elsewhere], ['7:18', '7:54', '8:29', '14:06', '15:07', '17:33']);
    const d = directionStretches('apart', [...every30, ...offEnd], coord);
    expect(d.regularPatternCount).toBe(1);
    expect(d.main!.stops).not.toEqual(shared);
  });
});
