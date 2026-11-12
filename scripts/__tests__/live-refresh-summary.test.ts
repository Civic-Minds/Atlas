import { describe, expect, it } from 'vitest';
import type { WeekMetrics } from '../../shared/liveDashboard';
import { refreshSummary, type SummaryRoute } from '../live-refresh-summary';

const week = (dates: string[], healthy: string[], late: number): WeekMetrics => ({
  days: dates.length, dates, healthyDates: healthy,
  late: { share: late, n: 1200 }, tripTime: { n: 50, scheduledMin: 40, typicalMin: 43.26, overMin: 3.26 },
  extraWait: { minutes: 1.84, gaps: 900 }, bunching: { share: 0.213, gaps: 900 }, delivered: { share: 0.962, seen: 962, notSeen: 38, unknown: 5 },
});
const thisDates = ['2026-11-05', '2026-11-06', '2026-11-07'], lastDates = ['2026-10-29', '2026-10-30', '2026-10-31'];
const health = [{ date: '2026-11-06', snapshots: 1440, healthy: true }, { date: '2026-11-07', snapshots: 612, healthy: false }];
const weekly = { thisWeek: week(thisDates, thisDates.slice(0, 2), 0.184), lastWeek: week(lastDates, lastDates, 0.201), comparable: true, health };
const manifest = { schema: 1, agency: 'ttc', generatedAt: '2026-11-12T10:00:00.000Z', thisWeek: { from: '2026-11-05', to: '2026-11-07' }, lastWeek: { from: '2026-10-29', to: '2026-10-31' }, routes: ['504', '512'] };
const routes: SummaryRoute[] = [
  { route: '504', status: 'ready', weekly, runs: { runs: 3454, reassigned: 47, dropped: 109, noTimetableTrip: 30, kept: 3695 } },
  { route: '512', status: 'held', weekly: undefined },
];
const match = {
  from: '2026-10-28', to: '2026-11-11', minShare: 0.9, ok: true,
  feeds: [{ key: 'S1000542', start: '20260930', end: '20261031' }, { key: 'S1000544', start: '20261101', end: '20261219' }],
  days: [
    { date: '2026-10-31', feed: 'S1000542', matched: 993, total: 1000, share: 0.993, problem: null, others: [{ feed: 'S1000544', matched: 455, share: 0.455 }] },
    { date: '2026-11-01', feed: 'S1000544', matched: 987, total: 1000, share: 0.987, problem: null, others: [{ feed: 'S1000542', matched: 750, share: 0.75 }] },
    { date: '2026-11-02', feed: 'S1000544', matched: 0, total: 0, share: null, problem: null, others: [] },
  ],
};

describe('live refresh summary', () => {
  const text = refreshSummary(manifest, weekly, routes, match);

  it('says which weeks are covered and how many days had good recordings', () => {
    expect(text).toContain('| This week | 2026-11-05 to 2026-11-07 | 2 of 3 |');
    expect(text).toContain('| Last week | 2026-10-29 to 2026-10-31 | 3 of 3 |');
  });

  it('lists each service date with the timetable it used, its match, and the other timetable beside it', () => {
    expect(text).toContain('| 2026-10-31 | S1000542 | 993/1000 | 99.3% | S1000544 45.5% |  |');
    expect(text).toContain('| 2026-11-01 | S1000544 | 987/1000 | 98.7% | S1000542 75.0% |  |');
    expect(text).toContain('| 2026-11-02 | S1000544 | 0/0 | no positions | – |  |');
  });

  it('gives the network and each route their headline numbers for both weeks, and names a held route', () => {
    expect(text).toContain('### This week: 2026-11-05 to 2026-11-07');
    expect(text).toContain('| Network | 2 of 3 | 18.4% (1200) | 3.3 min | 1.8 min | 21.3% | 96.2% |');
    expect(text).toContain('| 504 | 3 of 3 | 20.1% (1200) | 3.3 min | 1.8 min | 21.3% | 96.2% |');
    expect(text).toContain('| 512 | held | – | – | – | – | – |');
  });

  it('names the days left out for poor recordings and how many runs each route matched', () => {
    expect(text).toContain('- 2026-11-07: 612 snapshots (every route)');
    expect(text).not.toContain('- 2026-11-06');
    expect(text).toContain('| 504 | 3454 | 47 | 109 | 30 | 0.8% |');
    expect(text).toContain('| 512 | held | – | – | – | – |');
  });

  it('reports what the fetch could not read', () => {
    const day = (d: string, snapshots: number, failed: number, skipped = false) => ({ day: d, snapshots, failed, skipped, cut: false });
    const t = refreshSummary(manifest, weekly, routes, match, { fetch: { maxFailedShare: 0.02, ok: true, days: [day('2026-11-05', 0, 0, true), day('2026-11-06', 1440, 3), day('2026-11-07', 0, 0)] } });
    expect(t).toContain('2 day folders fetched, 1 already complete from an earlier run. The run fails when a day loses more than 2.0% of its snapshots.');
    expect(t).toContain('Could not read: 2026-11-06 3 of 1440.');
    expect(t).toContain('No snapshots at all in the archive for: 2026-11-07.');
    expect(text).toContain('No fetch report was given.');
  });

  it('puts the new numbers beside the published ones, with the size of the change', () => {
    const was = { thisWeek: week(['2026-10-08', '2026-10-14'], ['2026-10-08'], 0.087), lastWeek: week(lastDates, lastDates, 0.1), comparable: true };
    const published = {
      manifest: { ...manifest, generatedAt: '2026-10-16T19:54:50.293Z', routes: ['504', '511'] }, network: was,
      routes: [{ route: '504', status: 'ready', weekly: was }, { route: '511', status: 'ready', weekly: was }] as SummaryRoute[],
    };
    const t = refreshSummary(manifest, weekly, routes, match, { published });
    expect(t).toContain('Published: 2026-10-08 to 2026-10-14, built 2026-10-16T19:54:50.293Z. New: 2026-11-05 to 2026-11-07.');
    expect(t).toContain('| 504 | 8.7% -> 18.4% (+9.7 pts) | 3.3 -> 3.3 (+0 min) | 1.8 -> 1.8 (+0 min) | 21.3% -> 21.3% (+0.0 pts) | 96.2% -> 96.2% (+0.0 pts) |');
    expect(t).toContain('| 512 | not published -> held | – | – | – | – |');
    expect(t).toContain('Published now but not in this build: 511.');
    expect(text).toContain('No copy of the published files was given.');
  });

  it('warns when the two weeks cannot be compared, and copes with no match report', () => {
    const t = refreshSummary(manifest, { ...weekly, comparable: false }, [], null);
    expect(t).toContain('NOT comparable');
    expect(t).toContain('No match report was given.');
  });
});
