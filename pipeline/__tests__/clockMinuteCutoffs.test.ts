import { describe, expect, it } from 'vitest';
import {
  clockMinute,
  clockTimes,
  computePeriodCoverageHeadways,
  computePeriodInnerMaxGaps,
  computePeriodSustained,
  departuresInWindow,
  isUnevenPeriod,
  medianHeadwayInWindow,
} from '../headway-utils';
import { stretchFilterValue } from '../tripSets';

// CIV-1958 (#1760): the cut-off rules read clock minutes, so the same service gives the same answer whether its times
// carry seconds or not. Times are GTFS minutes; `s` adds seconds the way a seconds-keeping t2m would.
const hm = (h: number, m: number, s = 0) => h * 60 + m + s / 60;
const floored = (times: number[]) => times.map(clockMinute);

describe('cut-off rules give the same answer with seconds as with whole minutes (#1760)', () => {
  it('WMATA D6X Saturday AM: a 7:00:38 start passes the 60 cap as the 60-minute wait it prints as; the published wait stays exact', () => {
    const secs = [hm(7, 0, 38), hm(7, 12, 38), hm(7, 24, 38), hm(7, 36, 38), hm(7, 48, 38), hm(8, 0, 38), hm(8, 12, 38), hm(8, 24, 38), hm(8, 36, 38), hm(8, 48, 38)];
    expect(computePeriodCoverageHeadways(secs).amPeak).toBe(61);
    expect(computePeriodCoverageHeadways(clockTimes(secs)).amPeak).toBe(60);
    const p = { counts: true, countsSettled: true, value: 12, headway: 12, coverage: 61, coverageClock: 60, sustained: true, sustainedMid: true, oneGap: false, uneven: false };
    expect(stretchFilterValue(p)).toBe(12);
    expect(stretchFilterValue({ ...p, coverageClock: undefined })).toBe(61);
  });

  it('TTC 939 AM: a lead of 40.98 against every 5 is the same 8x boundary verdict as 40', () => {
    const secs = Array.from({ length: 28 }, (_, i) => hm(6, 40, 59) + i * 5);
    expect(computePeriodSustained(secs).amPeak).toBe(computePeriodSustained(floored(secs)).amPeak);
  });

  it('TTC 501 late: branch trips 23 seconds apart at the shared stop are one departure, as in the timetable', () => {
    const base = Array.from({ length: 18 }, (_, i) => hm(23, 8) + i * 10);
    const secs = base.flatMap(t => [t + 6 / 60, t + 29 / 60]);
    expect(medianHeadwayInWindow(secs, 23 * 60, 26 * 60, 3)).toBe(medianHeadwayInWindow(floored(secs), 23 * 60, 26 * 60, 3));
    expect(computePeriodSustained(secs).late).toBe(computePeriodSustained(floored(secs)).late);
  });

  it('Centro SU443: a 19:00:07 trip is in the window a 19:00 trip is in', () => {
    const secs = [hm(16, 20), hm(17, 24), hm(19, 0, 7)];
    expect(departuresInWindow(secs, 15 * 60, 19 * 60, true).length).toBe(departuresInWindow(floored(secs), 15 * 60, 19 * 60, true).length);
    expect(medianHeadwayInWindow(secs, 15 * 60, 19 * 60, 3)).not.toBeNull();
  });

  it('JTA 4 / NJT 74: an hourly gap with seconds (60.23, or 60 plus float noise) is the 60-minute gap it prints as, in clock minutes', () => {
    const secs = [hm(10, 36, 10), hm(11, 36, 24), hm(12, 35, 50)];
    expect(computePeriodInnerMaxGaps(clockTimes(secs))).toEqual(computePeriodInnerMaxGaps(floored(secs)));
    const noisy = [hm(15, 35, 17), hm(16, 35, 17), hm(17, 35, 17)];
    expect(computePeriodInnerMaxGaps(clockTimes(noisy)).pmPeak).toBe(60);
  });

  it('the other window readers agree on seconds and whole minutes', () => {
    const secs = [hm(9, 2, 41), hm(9, 14, 5), hm(9, 31, 59), hm(10, 2, 30), hm(11, 50, 12), hm(12, 5, 1), hm(14, 59, 59)];
    const f = floored(secs);
    expect(isUnevenPeriod(secs, 9 * 60, 15 * 60, 15)).toBe(isUnevenPeriod(f, 9 * 60, 15 * 60, 15));
    expect(computePeriodSustained(secs).midday).toBe(computePeriodSustained(f).midday);
  });
});
