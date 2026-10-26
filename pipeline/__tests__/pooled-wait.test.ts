import { describe, expect, it } from 'vitest';
import { pooledHeadwayInWindow, pooledWaitInWindow } from '../stopPools';
import { trueServiceEdges } from '../transit-phase2';

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
    expect(pooledWaitInWindow(fromGaps(900, repeat([1, 9], 24)), 900, 1140)).toBe(10);
    expect(pooledWaitInWindow([900, 900, 910, 910, 920, 920, 930, 930], 900, 940)).toBe(10);
  });

  it('refuses a list with a gap over 60 minutes (the stop falls back as before)', () => {
    // A peak express read at midday: 9:05, 9:20, then nothing until 14:40, 14:55.
    expect(pooledWaitInWindow([545, 560, 880, 895], 540, 900)).toBeNull();
    // A 60-minute gap is still read.
    expect(pooledWaitInWindow([540, 570, 630, 660, 690, 720, 750, 780, 810, 840, 870, 900], 540, 900)).toBe(35);
  });

  it('refuses a list that misses the period midpoint (rule 5)', () => {
    // PM peak 15:00-19:00, midpoint 17:00: every departure before it.
    expect(pooledWaitInWindow(fromGaps(900, repeat([10], 10)), 900, 1140)).toBeNull();
    // Every departure after it.
    expect(pooledWaitInWindow(fromGaps(1030, repeat([10], 10)), 900, 1140)).toBeNull();
  });

  it('never reads worse than the own pattern reading the same window', () => {
    // Own every 10 from 15:30; another pattern adds one early trip at 15:01 (gap 29).
    const own = fromGaps(930, repeat([10], 20));
    expect(pooledWaitInWindow([901, ...own], 900, 1140, 3, own)).toBe(10);
  });

  describe('a gap at a true end or start of service does not count (CIV-845 A)', () => {
    // DRT 901 Simcoe weekday evening at stop 707: every 15 from 19:03, last trip 23:00 after a
    // 27-minute gap, nothing later. With the 27: (13 * 225 + 729) / 222 = 16.5.
    const evening = fromGaps(1143, [...repeat([15], 13), 27]);
    const day = [...fromGaps(1083, repeat([10], 6)), ...evening];

    it('drops the closing gap when no later departure exists (Simcoe reads 15)', () => {
      expect(pooledWaitInWindow(day, 1140, 1380)).toBe(15);
    });

    it('keeps the gap when service continues after the window (not a service edge)', () => {
      expect(pooledWaitInWindow([...day, 1410, 1440], 1140, 1380)).toBe(16);
    });

    it('drops an opening gap when no earlier departure exists', () => {
      // First trip 15:02, then 15:30 and every 10: the 28-minute opening gap is the service start.
      const pm = [902, ...fromGaps(930, repeat([10], 21))];
      expect(pooledWaitInWindow(pm, 900, 1140)).toBe(10);
      // With an earlier trip at 14:40 the same 28 is internal to service and counts.
      expect(pooledWaitInWindow([880, ...pm], 900, 1140)).toBe(12);
    });

    it('an internal long gap still counts (CapMetro 320 Sunday midday: one 35 in every 30)', () => {
      const sunday = fromGaps(395, [...repeat([30], 6), 35, ...repeat([30], 27)]);
      expect(pooledWaitInWindow(sunday, 540, 900)).toBe(31);
    });

    it('needs 4 departures after trimming, as the edge gap allowance does', () => {
      // Three departures, both ends true edges: trimming would leave under 4, so both gaps count.
      expect(pooledWaitInWindow([1150, 1190, 1240], 1140, 1260)).toBe(Math.round((1600 + 2500) / 90));
    });

    it('an edge gap shorter than the rest never raises the wait', () => {
      // Every 20, last trip 5 minutes after the one before it.
      const list = [...fromGaps(1150, repeat([20], 10)), 1355];
      expect(pooledWaitInWindow([600, ...list], 1140, 1380)).toBe(Math.round((10 * 400 + 25) / 205));
    });

    it('trueServiceEdges is the shared edge test', () => {
      expect(trueServiceEdges([10, 20, 30], [5, 10, 20, 30])).toEqual({ opening: false, closing: true });
      expect(trueServiceEdges([10, 20, 30], [10, 20, 30, 40])).toEqual({ opening: true, closing: false });
    });
  });
});
