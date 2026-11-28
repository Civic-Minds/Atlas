import { describe, expect, it } from 'vitest';
import { countTrips, summarize } from '../trips-file-summary';

describe('trips-file summary (CIV-3130)', () => {
  it('counts trips and those carrying their last stop id', () => {
    const json = JSON.stringify({ t1: { d: 0, h: 'Broadview', e: '14016' }, t2: { d: 1, h: null }, t3: { d: 0, h: 'X', e: '' } });
    expect(countTrips(json)).toEqual({ trips: 3, withLastStop: 1 });
  });
  it('totals the agencies, with a live total only when every live size is known', () => {
    const a = { slug: 'ttc', trips: 10, withLastStop: 9, bytes: 900, liveBytes: 800 };
    const b = { slug: 'go', trips: 4, withLastStop: 4, bytes: 300, liveBytes: null };
    expect(summarize([a])).toMatchObject({ agencies: 1, trips: 10, withLastStop: 9, bytes: 900, liveBytes: 800 });
    const both = summarize([a, b]);
    expect(both).toMatchObject({ agencies: 2, trips: 14, withLastStop: 13, bytes: 1200, liveBytes: null });
    expect(both.rows.map(r => r.slug)).toEqual(['go', 'ttc']);
  });
});
