import { describe, expect, it } from 'vitest';
import { datesFromArgs, splitSnapshot } from '../live-fetch-archive';

describe('live-fetch-archive', () => {
  it('keeps every route of a snapshot, one line per route in the analysis format', () => {
    const out = splitSnapshot({ capturedAt: 100, vehicles: [
      { id: 'a', r: '504', tripId: 't1', lat: 1, lon: 2, t: 99, brg: 10, spd: 5 },
      { id: 'b', r: '29', tripId: 't2', lat: 3, lon: 4, t: null },
    ] }, () => true);
    expect([...out.keys()].sort()).toEqual(['29', '504']);
    expect(JSON.parse(out.get('504')!)).toEqual({ ts: 100, v: [['a', 't1', 1, 2, 99, 10, 5]] });
    expect(JSON.parse(out.get('29')!).v[0][4]).toBe(100);
  });
  it('can still keep a chosen list of routes', () => {
    expect([...splitSnapshot({ capturedAt: 1, vehicles: [{ id: 'a', r: '504', lat: 0, lon: 0 }, { id: 'b', r: '29', lat: 0, lon: 0 }] }, r => r === '29').keys()]).toEqual(['29']);
  });
  it('reads --days or a --from/--to range', () => {
    expect(datesFromArgs({ days: '2026-10-01,2026-10-02' })).toEqual(['2026-10-01', '2026-10-02']);
    expect(datesFromArgs({ from: '2026-09-30', to: '2026-10-02' })).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });
});
