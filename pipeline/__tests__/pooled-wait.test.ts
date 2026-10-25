import { describe, expect, it } from 'vitest';
import { pooledHeadwayInWindow, pooledWaitInWindow } from '../stopPools';

/** Departures from `start`, one after each gap in turn. */
const fromGaps = (start: number, gaps: number[]): number[] => {
  const out = [start];
  for (const g of gaps) out.push(out[out.length - 1] + g);
  return out;
};
const repeat = (pattern: number[], times: number) => Array.from({ length: times }, () => pattern).flat();

// CIV-845: a pooled stop shows the rider's wait as an even headway, sum(gap^2) / sum(gap).
describe('pooledWaitInWindow (CIV-845)', () => {
  it('even service reads its spacing', () => {
    expect(pooledWaitInWindow(fromGaps(900, repeat([8], 30)), 900, 1140)).toBe(8);
  });

  it('bunched pairs read close to the long gap, not the mean', () => {
    // Two every-16 branches 2 minutes apart: (4 + 196) / 16 = 12.5, rounds to 13.
    expect(pooledWaitInWindow(fromGaps(900, repeat([2, 14], 15)), 900, 1140)).toBe(13);
    // 4 / 12: (16 + 144) / 16 = 10.
    expect(pooledWaitInWindow(fromGaps(900, repeat([4, 12], 15)), 900, 1140)).toBe(10);
    // 6 / 10 (YRT Purple EB Bullock to Cornell): (36 + 100) / 16 = 8.5, rounds to 9.
    expect(pooledWaitInWindow(fromGaps(900, repeat([6, 10], 15)), 900, 1140)).toBe(9);
    // Two 30-minute branches 3 minutes apart are not every 15: (9 + 729) / 30 = 24.6.
    expect(pooledWaitInWindow(fromGaps(900, repeat([3, 27], 8)), 900, 1140)).toBe(25);
  });

  it('one long gap in frequent service no longer refuses the period', () => {
    // Every 7 with one 16-minute gap (HSR 05 weekday PM): the guarded rule refuses it.
    const times = fromGaps(900, [...repeat([7], 15), 16, ...repeat([7], 17)]);
    expect(pooledHeadwayInWindow(times, 900, 1140)).toBeNull();
    expect(pooledWaitInWindow(times, 900, 1140)).toBe(8);
  });

  it('a list under the minimum departures publishes nothing, as today', () => {
    expect(pooledWaitInWindow([900, 910], 900, 1140)).toBeNull();
    expect(pooledHeadwayInWindow([900, 910], 900, 1140)).toBeNull();
  });

  it('departures one minute apart are one bus (IndyGo), identical minutes count once', () => {
    expect(pooledWaitInWindow(fromGaps(900, repeat([1, 9], 12)), 900, 1140)).toBe(10);
    expect(pooledWaitInWindow([900, 900, 910, 910, 920, 920, 930], 900, 1140)).toBe(10);
  });

  it('never reads worse than the own pattern reading the same window', () => {
    // Own every 10 from 15:30; another pattern adds one early trip at 15:01 (gap 29).
    const own = fromGaps(930, repeat([10], 20));
    expect(pooledWaitInWindow([901, ...own], 900, 1140, 3, own)).toBe(10);
  });
});
