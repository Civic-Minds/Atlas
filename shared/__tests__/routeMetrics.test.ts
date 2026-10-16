import { describe, expect, it } from 'vitest';
import { dayHealth, delivered, runTimeStat, weekSplit, type RunTimeRow, type TripOutcome } from '../routeMetrics';

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
