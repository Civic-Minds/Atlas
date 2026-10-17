import { describe, expect, it } from 'vitest';
import { adherenceReport, stopDelayStats, type RunDelays } from '../stopDelay';
import { headwayBandStat } from '../segmentDelay';
import { stopBunching } from '../bunching';
import { dayHealth, delivered, goodDates, keepGoodDays, runTimeStat, weekSplit, type RunTimeRow, type TripOutcome } from '../routeMetrics';

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
