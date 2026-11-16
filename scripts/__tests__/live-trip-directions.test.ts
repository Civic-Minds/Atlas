import { describe, expect, it } from 'vitest';
import { fillMissingDirections } from '../live-trip-directions';

const st = (trip: string, stops: string[]) => stops.map((s, i) => ({ trip_id: trip, stop_id: s, stop_sequence: String(i + 1) }));

describe('fillMissingDirections', () => {
  it('reads opposite directions from stop order when the feed gives none, as the map pipeline does', () => {
    const trips = ['t1', 't2', 't3', 'r1', 'r2'].map(id => ({ route_id: '501', service_id: 's', trip_id: id, trip_headsign: id.startsWith('t') ? 'Express - Downtown via Princess St' : 'Express - Cataraqui Centre via Front', shape_id: id[0] }));
    const times = [...['t1', 't2', 't3'].flatMap(id => st(id, ['a', 'b', 'c', 'd', 'e'])), ...['r1', 'r2'].flatMap(id => st(id, ['e', 'd', 'c', 'b', 'a']))];
    const out = fillMissingDirections(trips, times);
    expect(out.inferred).toBe(true);
    expect(Object.fromEntries(out.trips.map(t => [t.trip_id, t.direction_id]))).toEqual({ t1: '0', t2: '0', t3: '0', r1: '1', r2: '1' });
    expect(trips.every(t => !('direction_id' in t))).toBe(true); // the input is not changed
  });
  it('leaves a timetable that has direction_id exactly as it is (the TTC)', () => {
    const trips = [{ route_id: '504', trip_id: 'x', direction_id: '1', shape_id: 'p' }, { route_id: '504', trip_id: 'y', direction_id: '0', shape_id: 'q' }];
    const out = fillMissingDirections(trips, [...st('x', ['a', 'b', 'c']), ...st('y', ['c', 'b', 'a'])]);
    expect(out.trips).toEqual(trips);
    expect(out.synthesized || out.inferred).toBe(false);
  });
});
