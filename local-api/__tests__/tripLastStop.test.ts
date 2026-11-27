import { describe, expect, it } from 'vitest';
import { tripLastStop } from '../live-vehicles';

// #1877: a vehicle's trip end comes from the timetable's trips file (e: its last stop id) and the stops file.
describe('tripLastStop', () => {
  const places = new Map([['S9', { name: 'Broadview Station', lonLat: [-79.3584, 43.6767] as [number, number] }], ['S0', { name: 'No place', lonLat: null }]]);
  const schedule = new Map([['t1', { d: 0, h: 'Broadview Ave', e: 'S9' }], ['t2', { d: 0, h: 'X', e: 'S0' }], ['t3', { d: 0, h: 'Y' }]]);
  it('gives the trip\'s last stop by name and place', () => {
    expect(tripLastStop('t1', schedule, places)).toEqual({ name: 'Broadview Station', lonLat: [-79.3584, 43.6767] });
  });
  it('gives null without a last stop, a place, a trip or a timetable', () => {
    expect(tripLastStop('t2', schedule, places)).toBeNull();
    expect(tripLastStop('t3', schedule, places)).toBeNull();
    expect(tripLastStop('nope', schedule, places)).toBeNull();
    expect(tripLastStop('t1', null, places)).toBeNull();
  });
});
