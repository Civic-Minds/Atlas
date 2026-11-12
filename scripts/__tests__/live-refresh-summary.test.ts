import { describe, expect, it } from 'vitest';
import type { WeekMetrics } from '../../shared/liveDashboard';
import { refreshSummary } from '../live-refresh-summary';

const week = (dates: string[], healthy: string[], late: number): WeekMetrics => ({
  days: dates.length, dates, healthyDates: healthy,
  late: { share: late, n: 1200 }, tripTime: { n: 50, scheduledMin: 40, typicalMin: 43.26, overMin: 3.26 },
  extraWait: { minutes: 1.84, gaps: 900 }, bunching: { share: 0.213, gaps: 900 }, delivered: { share: 0.962, seen: 962, notSeen: 38, unknown: 5 },
});
const thisDates = ['2026-11-05', '2026-11-06', '2026-11-07'], lastDates = ['2026-10-29', '2026-10-30', '2026-10-31'];
const weekly = { thisWeek: week(thisDates, thisDates.slice(0, 2), 0.184), lastWeek: week(lastDates, lastDates, 0.201), comparable: true };
const manifest = { schema: 1, agency: 'ttc', generatedAt: '2026-11-12T10:00:00.000Z', thisWeek: { from: '2026-11-05', to: '2026-11-07' }, lastWeek: { from: '2026-10-29', to: '2026-10-31' }, routes: ['504', '512'] };

describe('live refresh summary', () => {
  const text = refreshSummary(manifest, weekly, [{ route: '504', status: 'ready', weekly }, { route: '512', status: 'held', weekly: undefined }], {
    from: '2026-10-28', to: '2026-11-11', minShare: 0.9, ok: true,
    feeds: [{ key: 'S1000542', start: '20260930', end: '20261031' }, { key: 'S1000544', start: '20261101', end: '20261219' }],
    days: [
      { date: '2026-10-31', feed: 'S1000542', matched: 993, total: 1000, share: 0.993, problem: null },
      { date: '2026-11-01', feed: 'S1000544', matched: 987, total: 1000, share: 0.987, problem: null },
      { date: '2026-11-02', feed: 'S1000544', matched: 0, total: 0, share: null, problem: null },
    ],
  });

  it('says which weeks are covered and how many days had good recordings', () => {
    expect(text).toContain('| This week | 2026-11-05 to 2026-11-07 | 2 of 3 |');
    expect(text).toContain('| Last week | 2026-10-29 to 2026-10-31 | 3 of 3 |');
  });

  it('lists each service date with the timetable it used and its match', () => {
    expect(text).toContain('| 2026-10-31 | S1000542 | 993/1000 | 99.3% |  |');
    expect(text).toContain('| 2026-11-01 | S1000544 | 987/1000 | 98.7% |  |');
    expect(text).toContain('| 2026-11-02 | S1000544 | 0/0 | no positions |  |');
  });

  it('gives the network and each route their headline numbers for both weeks, and names a held route', () => {
    expect(text).toContain('### This week: 2026-11-05 to 2026-11-07');
    expect(text).toContain('| Network | 2 of 3 | 18.4% (1200) | 3.3 min | 1.8 min | 21.3% | 96.2% |');
    expect(text).toContain('| 504 | 3 of 3 | 20.1% (1200) | 3.3 min | 1.8 min | 21.3% | 96.2% |');
    expect(text.match(/\| 512 \| held \|/g)).toHaveLength(2);
  });

  it('warns when the two weeks cannot be compared, and copes with no match report', () => {
    const t = refreshSummary(manifest, { ...weekly, comparable: false }, [], null);
    expect(t).toContain('NOT comparable');
    expect(t).toContain('No match report was given.');
  });
});
