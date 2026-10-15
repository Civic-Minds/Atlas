import { describe, expect, it } from 'vitest';
import { dateRangeText, freshness, LIVE_DASHBOARD_HOLD, LINK_LABELS, buildupSentence, bunchingSentence, dashboardUnavailable, linkValueText, rankStops, type DashboardBunchingBand, type DashboardStop, type LiveV3 } from '../liveDashboard';

const stop = (id: string, dir: number, late: number, n = 100, ranked = true): DashboardStop => ({ stopId: id, name: id, directionId: dir, order: 0, n, medianMin: 0, p90Min: 5, lateShare: late, earlyShare: 0, ranked });

describe('dashboardUnavailable', () => {
  it('holds routes with a known problem, with the reason', () => {
    expect(dashboardUnavailable('ttc', '512')).toMatchObject({ status: 'held' });
    expect(dashboardUnavailable('ttc', '512')!.reason).toBe(LIVE_DASHBOARD_HOLD['ttc::512']);
  });
  it('says how to build a route that has no analysis, and nothing for one that has it', () => {
    expect(dashboardUnavailable('burlington', '1')!.reason).toMatch(/npm run live:analyze -- 1/);
    expect(dashboardUnavailable('ttc', '505')).toBeNull();
  });
});

describe('rankStops (B2)', () => {
  it('ranks by late share, leaves out stops with too few departures, and filters by direction', () => {
    const stops = [stop('a', 0, 0.1), stop('b', 0, 0.3), stop('c', 1, 0.2), stop('d', 0, 0.9, 5, false)];
    expect(rankStops(stops, null).map(s => s.stopId)).toEqual(['b', 'c', 'a']);
    expect(rankStops(stops, 0).map(s => s.stopId)).toEqual(['b', 'a']);
  });
});

describe('sentences', () => {
  const stretch = { fromStopId: 'a', toStopId: 'b', fromName: 'Dufferin', toName: 'Bathurst', n: 200, medianAddedMin: 2.4, addedShare: 0.71, medianDelayMin: 3, p10DelayMin: 0, p90DelayMin: 6 };
  it('says where delays start, or that no stretch does', () => {
    expect(buildupSentence('East', { directionId: 0, startingDelayMin: 0, start: stretch, biggest: stretch, stretches: [] })).toBe('East: delays start between Dufferin and Bathurst: +2.4 min added in 71% of 200 runs.');
    expect(buildupSentence('East', { directionId: 0, startingDelayMin: 0.6, start: null, biggest: null, stretches: [] })).toMatch(/no single stretch adds more than a minute.*\+0\.6 min/);
  });
  it('names a stretch when bunching forms, calls a slow climb gradual, and never says "caused by"', () => {
    const stops = [0.05, 0.2, 0.4].map((b, i) => ({ stopId: `s${i}`, name: `S${i}`, order: i, n: 50, badShare: b, bunchedShare: b, gappedShare: 0, medianGapSec: 300 }));
    const forms: DashboardBunchingBand = { baselineBadShare: 0.05, kind: 'forms', climb: 0.35, biggestRise: null, stops, forms: { fromStopId: 's0', toStopId: 's1', fromName: 'S0', toName: 'S1', rise: 0.15, fromBadShare: 0.05, toBadShare: 0.2, links: [] } };
    expect(bunchingSentence('West', forms)).toMatch(/forms between S0 and S1.*5% to 20% \(15 points\)/);
    expect(bunchingSentence('West', { ...forms, kind: 'gradual', forms: null })).toMatch(/builds gradually, from 5%.*40%/);
    for (const text of [bunchingSentence('W', forms), ...Object.values(LINK_LABELS)]) expect(text).not.toMatch(/caus/i);
  });
  it('shows every link with its number', () => {
    expect(linkValueText('stood_still', 0.57)).toBe('0.6 a day');
    expect(linkValueText('slow_stretch', 273)).toBe('+273 s vs timetable');
    expect(linkValueText('terminal_departures', null)).toBe('not measured');
  });
});

describe('freshness', () => {
  const v3 = (dates: string[]) => ({ window: { days: dates.length, dates, requestedDays: 7 } }) as unknown as LiveV3;
  const noon = (d: string) => Date.parse(`${d}T20:00:00Z`);
  it('is quiet when the newest day is recent', () => {
    expect(freshness(v3(['2026-10-13', '2026-10-14']), '505', noon('2026-10-15'))).toMatchObject({ stale: false, text: 'Data up to 2026-10-14.' });
  });
  it('warns, and says how to rebuild, after more than two days', () => {
    const f = freshness(v3(['2026-10-10']), '505', noon('2026-10-15'));
    expect(f.stale).toBe(true);
    expect(f.text).toMatch(/Data up to 2026-10-10, 5 days ago.*npm run live:analyze -- 505/);
  });
  it('says so when there are no days at all', () => {
    expect(freshness(v3([]), '505', 0).stale).toBe(true);
  });
});

describe('dateRangeText', () => {
  it('writes the range in plain format', () => {
    expect(dateRangeText('2026-10-08', '2026-10-14')).toBe('Oct 8–14');
    expect(dateRangeText('2026-09-30', '2026-10-14')).toBe('Sep 30–Oct 14');
    expect(dateRangeText('2026-10-08', '2026-10-08')).toBe('Oct 8');
  });
});
