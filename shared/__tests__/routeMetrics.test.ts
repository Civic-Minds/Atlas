import { describe, expect, it } from 'vitest';
import { adherenceReport, stopDelayStats, type RunDelays } from '../stopDelay';
import { headwayBandStat } from '../segmentDelay';
import { stopBunching } from '../bunching';
import { dayHealth, delivered, goodDates, snapshotsPerDate, HEALTHY_DAY_SHARE, MIN_SAME_TYPE_DAYS, keepGoodDays, runTimeStat, weekSplit, type RunTimeRow, type TripOutcome } from '../routeMetrics';

const row = (sched: number, actual: number): RunTimeRow => ({ date: 'd', directionId: 0, startHour: 8, schedSec: sched * 60, actualSec: actual * 60 });

describe('runTimeStat', () => {
  it('gives scheduled, typical, 1-in-10 and the difference in minutes', () => {
    const rows = [...Array(9).fill(0).map(() => row(22, 27)), row(22, 34)];
    expect(runTimeStat(rows)).toMatchObject({ n: 10, scheduledMin: 22, typicalMin: 27, overMin: 5 });
    expect(runTimeStat(rows)!.p90Min).toBeGreaterThanOrEqual(27);
    expect(runTimeStat([])).toBeNull();
  });
});

describe('delivered', () => {
  const o = (outcome: TripOutcome['outcome']): TripOutcome => ({ date: 'd', directionId: 0, outcome });
  it('counts only trips we can judge: unknown trips (data gaps) are not missed trips', () => {
    expect(delivered([o('seen'), o('seen'), o('seen'), o('not_seen'), o('unknown'), o('unknown')])).toEqual({ seen: 3, notSeen: 1, unknown: 2, share: 0.75 });
    expect(delivered([o('unknown')]).share).toBeNull();
  });
});

describe('day health and the two weeks', () => {
  it('marks a day with too few snapshots unhealthy and splits the last 14 dates into two weeks', () => {
    const dates = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const counts = new Map(dates.map(d => [d, d === '2026-10-12' ? 400 : 1400]));
    const health = dayHealth(counts);
    expect(health.find(h => h.date === '2026-10-12')!.healthy).toBe(false);
    const w = weekSplit(dates, health);
    expect(w.thisWeek).toHaveLength(7);
    expect(w.lastWeek[0]).toBe('2026-10-01');
    expect(w.thisHealthy).not.toContain('2026-10-12');
    expect(w.lastHealthy).toHaveLength(7);
  });
});

describe('good days only (CIV-318)', () => {
  const window = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'];
  const health = dayHealth(new Map(window.map(d => [d, d === '2026-10-12' ? 300 : 1400])));
  const good = new Set(goodDates(window, health));

  it('lists the window dates that are healthy, in order, and leaves the window itself alone', () => {
    expect(goodDates(window, health)).toEqual(['2026-10-10', '2026-10-11', '2026-10-13']);
    expect(window).toHaveLength(4);
    expect(goodDates(window, dayHealth(new Map(window.map(d => [d, 0]))))).toEqual([]);
  });

  it('keeps the input rows intact, so per-day tables still hold every day', () => {
    const rows = window.map(date => ({ date }));
    expect(keepGoodDays(rows, good).map(r => r.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-13']);
    expect(rows).toHaveLength(4);
  });

  const run = (date: string, delayMin: number, hour = 8): RunDelays => ({ date, directionId: 0, tripId: `${date}-${delayMin}`, stops: [{ stopId: 'A', t: 0, hour, delaySec: delayMin * 60 }] });
  // 30 on-time runs on each good day, and the bad day is all very late.
  const runs = window.flatMap(d => Array.from({ length: 30 }, () => run(d, d === '2026-10-12' ? 20 : 0)));

  it('worst stops and a direction late share: the bad day is excluded and the result is the hand-computed value', () => {
    const all = stopDelayStats(runs)[0];
    expect(all.n).toBe(120);
    expect(all.lateShare).toBeCloseTo(0.25);
    const goodOnly = stopDelayStats(keepGoodDays(runs, good))[0];
    expect(goodOnly.n).toBe(90);
    expect(goodOnly.lateShare).toBe(0);
    expect(goodOnly.medianMin).toBe(0);
    expect(adherenceReport(keepGoodDays(runs, good)).byDirection['0']).toMatchObject({ n: 90, late: 0 });
    expect(adherenceReport(runs).byDirection['0']).toMatchObject({ n: 120, late: 30 });
  });

  it('run time by hour: only good days feed the typical time', () => {
    const rows: RunTimeRow[] = window.flatMap(date => Array.from({ length: 10 }, () => ({ date, directionId: 0, startHour: 8, schedSec: 1200, actualSec: date === '2026-10-12' ? 3000 : 1500 })));
    expect(runTimeStat(rows)!.typicalMin).toBe(25);
    const kept = keepGoodDays(rows, good);
    expect(kept).toHaveLength(30);
    expect(runTimeStat(kept)).toMatchObject({ n: 30, typicalMin: 25, overMin: 5 });
    expect(runTimeStat(rows)!.p90Min).toBe(50);
    expect(runTimeStat(kept)!.p90Min).toBe(25);
  });

  it('bunching and extra wait: gap windows of the bad day are dropped', () => {
    const w = (date: string, gap: number) => ({ date, actualGaps: [gap, gap, gap], scheduledGaps: [600, 600, 600] });
    const wins = [w('2026-10-10', 600), w('2026-10-11', 600), w('2026-10-12', 60), w('2026-10-13', 600)];
    expect(stopBunching('A', wins).n).toBe(12);
    expect(stopBunching('A', wins).bunchedShare).toBeCloseTo(0.25);
    const kept = keepGoodDays(wins, good);
    expect(stopBunching('A', kept)).toMatchObject({ n: 9, bunchedShare: 0 });
    expect(headwayBandStat(kept)!.gaps).toBe(9);
    expect(headwayBandStat(kept)!.excessWaitSec).toBeCloseTo(0);
  });
});


describe('good days: one count, one yardstick (CIV-318 follow-up)', () => {
  const ts = (day: number, i: number) => Date.UTC(2026, 9, day) / 1000 + i * 60;
  const dateOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  /** A day of `n` snapshots a minute apart; `quiet` of them have no vehicles. */
  const day = (d: number, n: number, quiet: number) => Array.from({ length: n }, (_, i) => ({ ts: ts(d, i), vehicles: i < quiet ? 0 : 3 }));

  it('counts a snapshot with no vehicles the same whether the file has an empty line for it or no line', () => {
    const withEmpty = snapshotsPerDate(day(2, 1400, 200), dateOf);       // older format: empty lines kept
    const without = snapshotsPerDate(day(2, 1400, 200).filter(x => x.vehicles > 0), dateOf); // newer format: left out
    expect(withEmpty).toEqual(without);
    expect(withEmpty.get('2026-10-02')).toBe(1200);
  });
  it('counts a timestamp once, and leaves out snapshots outside the days to judge', () => {
    const dup = [{ ts: ts(2, 0), vehicles: 2 }, { ts: ts(2, 0), vehicles: 2 }, { ts: ts(3, 0), vehicles: 1 }];
    expect(snapshotsPerDate(dup, t => (dateOf(t) === '2026-10-03' ? null : dateOf(t)))).toEqual(new Map([['2026-10-02', 1]]));
  });
  it('gives a day list that mixes the two formats the same verdict as the same list in one format', () => {
    // Oct 2-3 written with empty lines (1300 real + 140 empty), Oct 9-10 without: the real counts are equal.
    const mixed = [...day(2, 1440, 140), ...day(3, 1440, 140), ...day(9, 1300, 0), ...day(10, 1300, 0)];
    const oneFormat = mixed.filter(x => x.vehicles > 0);
    const verdict = (s: typeof mixed) => dayHealth(snapshotsPerDate(s, dateOf)).map(h => [h.date, h.healthy]);
    expect(verdict(mixed)).toEqual(verdict(oneFormat));
    expect(verdict(mixed).every(([, ok]) => ok)).toBe(true); // counting empty lines as snapshots would have failed Oct 9-10 against 1440
  });
  it('holds a day to the median of the OTHER days of its own type: a Sunday is judged against Sundays', () => {
    const type = (d: string) => (['2026-10-04', '2026-10-11', '2026-10-18'].includes(d) ? 'sunday' : 'weekday');
    const counts = new Map<string, number>([
      ['2026-10-01', 1400], ['2026-10-02', 1400], ['2026-10-05', 1400], ['2026-10-06', 1400],
      ['2026-10-04', 900], ['2026-10-11', 880], ['2026-10-18', 890], // Sundays have fewer snapshots (service starts later)
    ]);
    const bySunday = Object.fromEntries(dayHealth(counts, type).map(h => [h.date, h.healthy]));
    expect(bySunday['2026-10-11']).toBe(true);
    expect(dayHealth(counts).find(h => h.date === '2026-10-11')!.healthy).toBe(false); // one yardstick for everything fails it
  });
  it('still fails a day with real gaps against its own type', () => {
    const type = (d: string) => (d.endsWith('-04') || d.endsWith('-11') || d.endsWith('-18') ? 'sunday' : 'weekday');
    const counts = new Map<string, number>([['2026-10-04', 900], ['2026-10-11', 500], ['2026-10-18', 905], ['2026-10-05', 1400], ['2026-10-06', 1400]]);
    expect(Object.fromEntries(dayHealth(counts, type).map(h => [h.date, h.healthy]))['2026-10-11']).toBe(false);
  });
  it('passes at exactly 90% of the typical day and fails just under it', () => {
    expect(HEALTHY_DAY_SHARE).toBe(0.9);
    const ok = new Map([['a', 1000], ['b', 1000], ['c', 1000], ['d', 900]]);
    const under = new Map([['a', 1000], ['b', 1000], ['c', 1000], ['d', 899]]);
    expect(dayHealth(ok).find(h => h.date === 'd')!.healthy).toBe(true);
    expect(dayHealth(under).find(h => h.date === 'd')!.healthy).toBe(false);
  });
  it('falls back to every other day when fewer than two others share its type, and a lone day is its own yardstick', () => {
    expect(MIN_SAME_TYPE_DAYS).toBe(2);
    const type = (d: string) => (d.startsWith('sun') ? 'sunday' : 'weekday');
    const counts = new Map([['mon', 1400], ['tue', 1400], ['wed', 1400], ['sun1', 600], ['sun2', 1300]]);
    const h = Object.fromEntries(dayHealth(counts, type).map(x => [x.date, x.healthy]));
    // sun1 has ONE other Sunday: all other days (1400, 1400, 1400, 1300) are its yardstick, so 600 fails.
    expect(h.sun1).toBe(false);
    expect(h.sun2).toBe(true); // 1300 against the other four days (median 1400): 1300 >= 1260
  });
  it('a single day is healthy when it has any snapshots, and an empty list gives nothing', () => {
    expect(dayHealth(new Map([['a', 5]]))[0].healthy).toBe(true);
    expect(dayHealth(new Map([['a', 0]]))[0].healthy).toBe(false);
    expect(dayHealth(new Map())).toEqual([]);
  });
});
