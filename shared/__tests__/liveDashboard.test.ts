import { describe, expect, it } from 'vitest';
import { runningTimeSentence, freshness, LIVE_DASHBOARD_HOLD, LINK_LABELS, bunchingSentence, dashboardUnavailable, linkValueText, rankStops, type DashboardBunchingBand, type DashboardStop, type LiveV3 } from '../liveDashboard';

const stop = (id: string, dir: number, late: number, n = 100, ranked = true): DashboardStop => ({ stopId: id, name: id, directionId: dir, order: 0, n, medianMin: 0, p90Min: 5, lateShare: late, earlyShare: 0, ranked });

describe('dashboardUnavailable', () => {
  it('holds no route by hand: the 512 is judged by the quality check on every build (CIV-2000)', () => {
    expect(LIVE_DASHBOARD_HOLD).toEqual({});
    expect(dashboardUnavailable('ttc', '512')).toBeNull();
  });
  it('says how to build a route that has no analysis, and nothing for one that has it', () => {
    expect(dashboardUnavailable('burlington', '1')!.reason).not.toMatch(/npm run/);
    expect(dashboardUnavailable('burlington', '1')!.devHint).toMatch(/npm run live:analyze -- 1/);
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
  it('names a stretch when bunching forms, calls a slow climb gradual, and never says "caused by"', () => {
    const stops = [0.05, 0.2, 0.4].map((b, i) => ({ stopId: `s${i}`, name: `S${i}`, order: i, n: 50, badShare: b, bunchedShare: b, gappedShare: 0, medianGapSec: 300 }));
    const forms: DashboardBunchingBand = { baselineBadShare: 0.05, kind: 'forms', climb: 0.35, biggestRise: null, stops, forms: { fromStopId: 's0', toStopId: 's1', fromName: 'S0', toName: 'S1', rise: 0.15, fromBadShare: 0.05, toBadShare: 0.2, links: [] } };
    expect(bunchingSentence('West', forms)).toMatch(/forms between S0 and S1.*5% to 20% \(15 points\)/);
    expect(bunchingSentence('West', { ...forms, kind: 'gradual', forms: null })).toMatch(/builds gradually, from 5%.*40%/);
    for (const text of [bunchingSentence('W', forms), ...Object.values(LINK_LABELS)]) expect(text).not.toMatch(/caus/i);
  });
  it('shows every link with its number', () => {
    expect(linkValueText('stood_still', 0.57)).toBe('0.6 a day');
    expect(linkValueText('slow_stretch', 273)).toBe('+273 s vs schedule');
    expect(linkValueText('terminal_departures', null)).toBe('not measured');
  });
});

describe('freshness', () => {
  const v3 = (dates: string[]) => ({ window: { days: dates.length, dates, requestedDays: 7 } }) as unknown as LiveV3;
  const noon = (d: string) => Date.parse(`${d}T20:00:00Z`);
  it('is quiet when the newest day is recent', () => {
    expect(freshness(v3(['2026-10-13', '2026-10-14']), '505', noon('2026-10-15'))).toMatchObject({ stale: false, text: 'Data up to Oct 14.' });
  });
  it('warns, with the rebuild command kept apart as a developer hint, after more than two days', () => {
    const f = freshness(v3(['2026-10-10']), '505', noon('2026-10-15'));
    expect(f.stale).toBe(true);
    expect(f.text).toBe('Data up to Oct 10, 5 days ago.');
    expect(f.text).not.toMatch(/npm run/);
    expect(f.devHint).toMatch(/npm run live:analyze -- 505/);
  });
  it('says so when there are no days at all', () => {
    expect(freshness(v3([]), '505', 0).stale).toBe(true);
  });
});


describe('running time', () => {
  it('says scheduled and usual in plain words, and does not guess from a handful of trips', () => {
    expect(runningTimeSentence('Eastbound', { n: 120, scheduledMin: 22, typicalMin: 27.2, p90Min: 34.4, overMin: 5 })).toBe('Eastbound: scheduled 22 min · usually 27.');
    expect(runningTimeSentence('Eastbound', { n: 120, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 }, 17)).toMatch(/at 5 PM\.$/);
    expect(runningTimeSentence('Eastbound', { n: 10, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 })).toMatch(/too few trips \(10\)/);
    expect(runningTimeSentence('Eastbound', null)).toMatch(/too few trips were measured over the main stretch/);
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

describe('run-time stretch wording', () => {
  const st = (stops: number, from: string, to: string) => ({ fromStopId: 'a', toStopId: 'b', fromName: from, toName: to, stops, fullRoute: false, mainPatternTrips: 0, trips: 10 });
  it('names the stretch on the tile and the section, so it never reads as the whole route', async () => {
    const { runTimeTileStretch, runTimeStretchLabel } = await import('../liveDashboard');
    expect(runTimeTileStretch({ '0': st(7, 'Humber Loop', 'Park Lawn'), '1': st(5, 'Park Lawn', 'Stephen Dr') })).toBe('over 5–7 stops: Humber Loop to Park Lawn; Park Lawn to Stephen Dr');
    expect(runTimeTileStretch({ '0': st(22, 'Sackville', 'Dufferin') })).toBe('over 22 stops, Sackville to Dufferin');
    expect(runTimeTileStretch(undefined)).toBeNull();
    expect(runTimeStretchLabel(st(7, 'Humber Loop', 'Park Lawn'))).toBe('Trip time over 7 stops, Humber Loop to Park Lawn, all trips');
  });
});

describe('build-up label with a terminal stretch', () => {
  it('reads "stays about the same" when the only jump is the run into the end loop, with start and end figures from inside the route', async () => {
    const { delayBuildup } = await import('../stopDelay');
    const { buildupTakeaway } = await import('../liveDashboard');
    const runs = Array.from({ length: 40 }, (_, k) => ({ date: '2026-10-01', directionId: 0, tripId: `t${k}`, stops: [0, 0.2, 0.4, 7.4].map((m, i) => ({ stopId: 'ABCD'[i], t: 0, hour: 8, delaySec: Math.round(m * 60) })) }));
    const [d] = delayBuildup(runs, new Map([[0, ['A', 'B', 'C', 'D']]]), undefined, stop => stop === 'D');
    const named = { ...d, forms: null, start: null, biggest: null, stretches: d.stretches.map(s => ({ ...s, fromName: s.fromStopId, toName: s.toStopId })) };
    const text = buildupTakeaway(named as never);
    expect(text).toMatch(/^Delay stays about the same from end to end/);
    expect(text).not.toMatch(/7\.4/);
  });
});

describe('branch lines follow the time of day', () => {
  it('uses the period figures, none for a period with no trips, and all day for an older file', async () => {
    const { branchFigures } = await import('../liveDashboard');
    const all = { n: 215, scheduledMin: 14, typicalMin: 12, p90Min: 16, overMin: -2 };
    const am = { n: 12, scheduledMin: 15, typicalMin: 14, p90Min: 17, overMin: -1 };
    const base = { fromStopId: 'a', toStopId: 'b', fromName: 'A', toName: 'B', stops: 14, all, byHour: [] };
    expect(branchFigures({ ...base, bands: { all, amPeak: am, evening: null } }, 'amPeak')).toBe(am);
    expect(branchFigures({ ...base, bands: { all, amPeak: am, evening: null } }, 'evening')).toBeNull();
    expect(branchFigures(base, 'all')).toBe(all);
    expect(branchFigures(base, 'pmPeak')).toBeNull();
  });
});

describe('qualityHold', () => {
  const v3 = (swap: number, n: number, unlisted = 0) => ({ swaps: { rate: swap, reassigned: 0, dropped: 0 }, adherence: { timepoints: { all: { overall: { n } } } }, leftOut: { kept: 100 - unlisted, noTimetableTrip: unlisted, excluded: 0, excludedLabel: null } }) as unknown as LiveV3;
  it('holds a route the way the 512 is held, and passes the shown streetcars', async () => {
    const { qualityHold } = await import('../liveDashboard');
    expect(qualityHold(v3(0.152, 1554))).toMatch(/15% of its trips ran under a trip number/);
    expect(qualityHold(v3(0.06, 2434))).toBeNull();
    expect(qualityHold(v3(0.033, 3126, 35))).toBeNull(); // 501: 35% unlisted runs, still shown
    expect(qualityHold(v3(0, 120))).toMatch(/Only 120 departures/);
    expect(qualityHold(v3(0, 0))).toMatch(/gives no stop times/);
    expect(qualityHold(v3(0, 900, 60))).toMatch(/60% of its vehicles/);
  });
});

describe('a held route in Studio (CIV-2000)', () => {
  const week = { days: 7, dates: [], healthyDates: [], late: { share: 0.3, n: 900 }, tripTime: { n: 50, scheduledMin: 30, typicalMin: 34, overMin: 4 }, extraWait: { minutes: 1.2, gaps: 400 }, bunching: { share: 0.2, gaps: 400 }, delivered: { share: 0.98, seen: 98, notSeen: 2, unknown: 0 }, cutoffCounts: { lateness: { start: 0, counts: [5] }, gaps: { start: 0, counts: [7] }, gapRatio: { start: 0, counts: [3] } } };
  const band = { stops: [{ stopId: 's' }], buildup: [{ directionId: 0 }], adherence: { timepoints: { all: { overall: { n: 900 } } } } };
  const file = (swap: number, n: number, unlisted = 0) => ({
    schema: 3, swaps: { rate: swap, reassigned: 0, dropped: 0 }, leftOut: { kept: 100 - unlisted, noTimetableTrip: unlisted, excluded: 0, excludedLabel: null },
    adherence: { timepoints: { all: { overall: { n } } } }, stops: [{ stopId: 's' }], buildup: [{ directionId: 0 }], bands: { all: band, amPeak: band },
    runningTime: { bands: {} }, serviceDelivered: { byDay: [] }, extraWait: { all: [{ stopId: 's' }] }, bunching: [{ directionId: 0, bands: {} }],
    stopHours: { '0': { s: [[10, 0.4, 8, 0.1, 0.2, 1.5], null] } },
    daily: { '2026-11-19': { healthy: true, late: { share: 0.3, n: 9 }, tripTime: null, extraWait: { minutes: 1, gaps: 9 }, bunching: { share: 0.1, gaps: 9 }, delivered: null, lateByHour: [{ hour: 7, n: 9, lateShare: 0.3 }] } },
    weekly: { minHealthyDays: 3, health: [], comparable: true, thisWeek: week, lastWeek: week, bands: { amPeak: { thisWeek: week, lastWeek: week } } },
  }) as unknown as LiveV3;
  it('keeps gaps and bunching and empties every delay figure for a swapped-trip route', async () => {
    const { gapsOnlyV3, heldRouteLine } = await import('../liveDashboard');
    const g = gapsOnlyV3(file(0.15, 1500));
    expect(heldRouteLine(file(0.15, 1500))).toBe('Gaps and bunching only: its delays are hidden because about 15% of its trips ran under a trip number that does not match the schedule.');
    expect([g.stops, g.buildup, g.bands.all.stops, g.bands.amPeak.buildup]).toEqual([[], [], [], []]);
    expect(g.adherence.timepoints.all.overall.n).toBe(0);
    expect(g.runningTime).toBeUndefined();
    expect(g.serviceDelivered).toBeUndefined();
    for (const w of [g.weekly!.thisWeek, g.weekly!.lastWeek, g.weekly!.bands!.amPeak!.thisWeek]) {
      expect([w.late, w.tripTime, w.delivered]).toEqual([null, null, null]);
      expect([w.extraWait, w.bunching]).toEqual([week.extraWait, week.bunching]);
      expect(w.cutoffCounts!.lateness.counts).toEqual([]);
      expect(w.cutoffCounts!.gaps.counts).toEqual([7]);
    }
    expect(g.daily!['2026-11-19']).toMatchObject({ late: null, lateByHour: undefined, bunching: { share: 0.1 } });
    expect(g.stopHours!['0'].s[0]).toEqual([10, null, 8, 0.1, 0.2, 1.5]);
    expect(g.bunching).toHaveLength(1);
  });
  it('shows no figures when gaps cannot be trusted either', async () => {
    const { gapsOnlyV3, heldRouteLine } = await import('../liveDashboard');
    const g = gapsOnlyV3(file(0, 900, 60));
    expect(heldRouteLine(file(0, 900, 60))).toBe('No figures: 60% of its vehicles ran under trip numbers that are not on the schedule.');
    expect(heldRouteLine(file(0, 0))).toBe('No figures: its schedule gives no stop times to compare with.');
    expect(g.bunching).toEqual([]);
    expect([g.weekly!.thisWeek.extraWait, g.weekly!.thisWeek.bunching, g.weekly!.thisWeek.late]).toEqual([null, null, null]);
    expect(g.stopHours).toBeUndefined();
    expect(heldRouteLine(file(0.05, 1500))).toBeNull();
  });
});
