import { describe, expect, it } from 'vitest';
import { diffPeriod } from '../history-v2-diff.js';

// CIV-1430: the per-period, per-route diff of a pinned rebuild against the published sidecars.
describe('history-v2-diff (CIV-1430)', () => {
  it('the diff says weekday byte-identical only when nothing but weekend fields moved', () => {
    const sc = (sat: unknown, h = 12) => JSON.stringify({ version: 2, slug: 'mbta', periodKey: 'p', refDate: '20181129', routes: { 1: { rep: { h }, sat } } });
    const added = diffPeriod('p', sc({ h: 15 }), sc({ h: 15, p: { midday: 15 }, tp: { midday: 9 } }));
    expect(added).toMatchObject({ status: 'weekend-only', weekdayIdentical: true, addedTotal: 2, addedCounts: { 'sat.p': 1, 'sat.tp': 1 } });
    const weekday = diffPeriod('p', sc({ h: 15 }), sc({ h: 15, p: { midday: 15 } }, 13));
    expect(weekday).toMatchObject({ status: 'changed', weekdayIdentical: false });
    expect(weekday.changes?.['1']?.map(c => c.path)).toEqual(['routes.1.rep.h']);
    const weekendHeadline = diffPeriod('p', sc({ h: 15 }), sc({ h: 16, p: { midday: 15 } }));
    expect(weekendHeadline).toMatchObject({ status: 'changed', weekdayIdentical: true });
    expect(diffPeriod('p', sc({ h: 15 }), sc({ h: 15 }))).toMatchObject({ status: 'identical', addedTotal: 0 });
    expect(diffPeriod('p', sc({ h: 15 }), undefined)).toMatchObject({ status: 'published-only' });
  });

});
