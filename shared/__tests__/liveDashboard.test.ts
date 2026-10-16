import { describe, expect, it } from 'vitest';
import { compareLines, deliveredSentence, extraWaitSentence, runningTimeSentence, toCsv, dateRangeText, freshness, LIVE_DASHBOARD_HOLD, LINK_LABELS, buildupSentence, bunchingSentence, dashboardUnavailable, linkValueText, rankStops, type DashboardBunchingBand, type DashboardBuildup, type DashboardStop, type LiveV3 } from '../liveDashboard';

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
  it('leaves out the first stops of a direction whose start is less exact', () => {
    const stops = [{ ...stop('a', 1, 0.5), order: 0 }, { ...stop('b', 1, 0.4), order: 4 }, { ...stop('c', 0, 0.3), order: 0 }];
    expect(rankStops(stops, null, [{ directionId: 1, stops: 4 }]).map(s => s.stopId)).toEqual(['b', 'c']);
  });
});

describe('sentences', () => {
  const stretch = { fromStopId: 'a', toStopId: 'b', fromName: 'Dufferin', toName: 'Bathurst', n: 200, medianAddedMin: 2.4, addedShare: 0.71, growShare: 0.75, medianDelayMin: 3, p10DelayMin: 0, p90DelayMin: 6 };
  const build = (over: object) => ({ directionId: 0, startingDelayMin: 0, kind: null, forms: null, climbMin: null, start: null, biggest: null, stretches: [], ...over }) as unknown as DashboardBuildup;
  it('names the stretch where delay builds up and how consistent it is, calls a slow climb gradual, and says when it does not build', () => {
    expect(buildupSentence('East', build({ kind: 'forms', forms: stretch }))).toBe('East: delay builds up between Dufferin and Bathurst: +2.4 min added there, and it stays up for the next few stops. Delay grows by 30+ seconds on 75% of 200 trips.');
    expect(buildupSentence('East', build({ kind: 'gradual', climbMin: 2.1 }))).toBe('East: delay builds gradually along the route (+2.1 min from start to end). No single stretch stands out.');
    expect(buildupSentence('East', build({ kind: 'none' }))).toBe('East: delay does not build up along the route.');
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

describe('toCsv', () => {
  it('quotes cells with commas, quotes or line breaks', () => {
    expect(toCsv(['Stop', 'Late'], [['King, at "Bay"', 0.12], ['Plain', null]])).toBe('Stop,Late\n"King, at ""Bay""",0.12\nPlain,\n');
  });
});

describe('running time, extra wait, service delivered', () => {
  it('says scheduled, usual and 1-in-10 in plain words, and does not guess from a handful of trips', () => {
    expect(runningTimeSentence('Eastbound', { n: 120, scheduledMin: 22, typicalMin: 27.2, p90Min: 34.4, overMin: 5 })).toBe('Eastbound: scheduled 22 min · usually 27 · 1 in 10 over 34 min.');
    expect(runningTimeSentence('Eastbound', { n: 120, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 }, 17)).toMatch(/at 5pm\.$/);
    expect(runningTimeSentence('Eastbound', { n: 10, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 })).toMatch(/too few trips \(10\)/);
    expect(runningTimeSentence('Eastbound', null)).toMatch(/too few trips were measured over the main stretch/);
  });
  it('names the stop where riders wait longest, in half minutes, or says waits match the timetable', () => {
    const stops = [{ name: 'Spadina & Queens Quay', extraWaitMin: 2.1, gaps: 500 }, { name: 'Other', extraWaitMin: 0.4, gaps: 500 }, { name: 'Thin', extraWaitMin: 9, gaps: 5 }];
    expect(extraWaitSentence(stops, 'Northbound')).toBe('Northbound: riders at Spadina & Queens Quay wait about 2 min longer than scheduled.');
    expect(extraWaitSentence([{ name: 'A', extraWaitMin: 0.2, gaps: 100 }], 'Northbound')).toMatch(/about as long as the timetable promises/);
    expect(extraWaitSentence([], 'Northbound')).toBeNull();
  });
  it('says how many scheduled trips ran, among those we can judge', () => {
    expect(deliveredSentence({ seen: 960, notSeen: 40, unknown: 5, share: 0.96 })).toBe('96% of scheduled trips ran (960 of 1,000 that we can judge).');
    expect(deliveredSentence({ seen: 0, notSeen: 0, unknown: 3, share: null }, 'Eastbound')).toMatch(/not enough days of recordings/);
  });
  it('compares this week with last with one rule: plain up or down, and better or worse by which way is good', () => {
    const wk = (late: number, minutes: number, delivered: number) => ({
      days: 7, dates: [], healthyDates: [], late: { share: late, n: 1000 }, tripTime: { n: 100, scheduledMin: 30, typicalMin: 31, overMin: 1 },
      extraWait: { minutes, gaps: 1000 }, bunching: { share: 0.2, gaps: 1000 }, delivered: { share: delivered, seen: 90, notSeen: 10, unknown: 0 },
    });
    const lines = compareLines({ minHealthyDays: 4, health: [], comparable: true, thisWeek: wk(0.09, 1.1, 0.96), lastWeek: wk(0.12, 1.1, 0.99) });
    expect(lines.find(l => l.key === 'late')).toMatchObject({ text: '9% late, down from 12%.', direction: 'better' });
    expect(lines.find(l => l.key === 'extraWait')).toMatchObject({ text: 'Riders wait 1.1 min longer than scheduled, unchanged from last week.', direction: 'same' });
    expect(lines.find(l => l.key === 'delivered')).toMatchObject({ text: '96% of scheduled trips ran, down from 99%.', direction: 'worse' });
    expect(lines.find(l => l.key === 'bunching')!.text).toBe('20% of gaps too close or too far apart, unchanged from last week.');
  });
});

describe('week-change colouring (one rule for the dashboard and the full analysis)', () => {
  it('measures noise as 2 x the standard error of the difference of two weekly means', async () => {
    const { dailyNoise } = await import('../liveDashboard');
    // sd of [0.1, 0.2, 0.3] is 0.1; 2 * 0.1 * sqrt(1/3 + 1/3)
    expect(dailyNoise([0.1, 0.2, 0.3], 3, 3)).toBeCloseTo(0.1633, 4);
    expect(dailyNoise([0.1, 0.2], 2, 2)).toBeNull();
  });
  it('greys a change inside the noise and colours one outside it', async () => {
    const { dailyNoise, weekChangeTone } = await import('../liveDashboard');
    const noisy = dailyNoise([0.07, 0.33, 0.1, 0.11, 0.13, 0.1], 6, 7)!;
    expect(weekChangeTone('late', 0.25, 0.2, true, noisy)).toMatchObject({ tone: 'same', measured: true });
    expect(weekChangeTone('late', 0.25, 0.2, true, 0.02)).toMatchObject({ tone: 'worse', big: true });
    // No daily values: the fixed provisional amount (bunching 2 points), so 20% to 21% stays grey.
    expect(weekChangeTone('bunching', 0.21, 0.2, true)).toMatchObject({ tone: 'same', measured: false });
    expect(weekChangeTone('delivered', 0.96, 0.99, false)).toMatchObject({ tone: 'worse' });
  });
});
