import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERIOD_MINUTES } from '../../shared/config.js';
import { computePeriodSustained, isUnevenPeriod, slowFirstHourSetAside } from '../headway-utils.js';
import { directionSlowStart, rollupDirection, rollupRoute, stampStretchShadow, stopPeriodValues, stretchFilterValue, stretchMetaPeriods, stretchPeriods, type DirectionStretches, type Stretch } from '../tripSets.js';

// #1142 (CIV-1018): a period the settled check calls steady but that runs a slower stretch of
// several medium gaps reads its longest wait, and publishes its typical gap for the card's range.
const { start, end } = PERIOD_MINUTES.midday;
const every = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const main = (times: number[]): Stretch => ({ kind: 'main', stops: ['s'], refStop: 's', lengthKm: 0, times, nightTimes: times, tripCount: times.length });

// TTC 320's weekday overnight shape, moved to midday: every 5, then a block every 15, then every 5.
const ttc320 = [...every(start, start + 150, 5), ...every(start + 165, start + 270, 15), ...every(start + 275, end, 5)];

describe('isUnevenPeriod (#1142)', () => {
  it('a slower block of medium gaps is uneven, though the settled check calls it steady (TTC 320)', () => {
    expect(computePeriodSustained(ttc320).midday).toBe(true);
    expect(isUnevenPeriod(ttc320, start, end, 5)).toBe(true);
  });

  it('a steady period is not uneven', () => {
    expect(isUnevenPeriod(every(start, end, 10), start, end, 10)).toBe(false);
  });

  it('one long gap is the settled check\'s job, not this one', () => {
    const times = [...every(start, start + 150, 5), ...every(start + 240, end, 5)];
    expect(isUnevenPeriod(times, start, end, 5)).toBe(false);
  });

  it('a slow first hour before the peak builds up stays steady (MBTA 7 AM)', () => {
    const times = [...every(start, start + 60, 15), ...every(start + 64, end, 4)];
    expect(isUnevenPeriod(times, start, end, 4)).toBe(false);
    // The same slow start lasting longer than an hour is uneven.
    const longer = [...every(start, start + 120, 15), ...every(start + 124, end, 4)];
    expect(isUnevenPeriod(longer, start, end, 4)).toBe(true);
  });

  it('a repeating uneven cycle is uneven (TTC 129 PM: 14, 7, 7)', () => {
    const times: number[] = [];
    for (let t = start; t <= end; t += 28) times.push(t, t + 14, t + 21);
    expect(isUnevenPeriod(times.filter(t => t <= end), start, end, 7)).toBe(true);
  });
});

// CIV-1411 (refs #602), under evaluation behind ATLAS_SLOW_FIRST_HOUR_UNSTEADY: a period the settled
// check calls unsteady only because of gaps in its slow first hour reads its typical gap.
describe('a slow first hour in an unsteady period (CIV-1411)', () => {
  const am = PERIOD_MINUTES.amPeak;
  const hm = (h: number, m: number) => h * 60 + m;
  const tail = (times: number[]): Stretch => ({ ...main(times), kind: 'tail', stops: ['t'], refStop: 't' });
  const direction = (times: number[], tails: number[][] = []) => ({ key: 'r::1::Weekday', main: main(times), tails: tails.map(tail), regularPatternCount: 1 + tails.length, variantTripCount: 0 }) as unknown as DirectionStretches;
  const read = (times: number[], on: boolean, tails: number[][] = []) => {
    vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', on ? '1' : '');
    const p = rollupDirection(direction(times, tails))!.period.amPeak;
    return { value: p.value, sustained: p.sustained, uneven: p.typical != null, filter: p.filterValue };
  };
  /** The rule leaves the period exactly as it reads without it. */
  const unchanged = (times: number[], tails: number[][] = []) => {
    expect(read(times, true, tails)).toEqual(read(times, false, tails));
    return read(times, true, tails);
  };
  afterEach(() => vi.unstubAllEnvs());

  // TTC Line 5 westbound at stop 16076 (feed S1000544): 6:06, 6:26, 6:46, every 8.5 to 7:27, then every 3.6.
  const line5 = [hm(6, 6), hm(6, 26), hm(6, 46), 413.5, 422, 430.5, 439, 447.5, ...Array.from({ length: 30 }, (_, i) => Math.round((452.3 + i * 3.65) * 10) / 10)];
  // TransLink 99 eastbound at stop 2118 (#602): first bus 6:23, gaps 16, 6, 19, 8, then every 3 to 6.
  const translink99 = [hm(6, 23), hm(6, 39), hm(6, 45), hm(7, 4), hm(7, 12), hm(7, 17), hm(7, 22), hm(7, 28), hm(7, 30), hm(7, 35), hm(7, 40), hm(7, 43), ...every(hm(7, 47), hm(9, 0), 3)];
  const at = (list: string) => list.split(' ').map(t => hm(Number(t.split(':')[0]), Number(t.split(':')[1])));
  // STM weekday, from the feed, at each direction's reference stop. 18 eastbound (52414) and 24 westbound (52278)
  // start before 6:00 at every 30; 51 eastbound (53677) runs every 10 to 20 until 7:15.
  const stm18 = at('5:15 5:43 6:13 6:37 6:49 7:01 7:14 7:24 7:32 7:39 7:43 7:46 8:00 8:05 8:11 8:17 8:38 8:47 8:57');
  const stm24 = at('5:31 6:01 6:34 6:48 7:01 7:13 7:24 7:32 7:42 7:47 7:57 8:02 8:14 8:20 8:26 8:38 8:44 8:49 8:54 8:59');
  const stm51 = at('5:08 5:34 5:57 6:09 6:29 6:39 6:57 7:15 7:19 7:23 7:27 7:34 7:36 7:43 7:49 7:53 7:56 8:01 8:04 8:08 8:12 8:16 8:20 8:23 8:29 8:35 8:37 8:43 8:50 8:55 8:58');

  it('reads the rush figure with the switch on and the longest wait without it (TTC Line 5: gaps of 20)', () => {
    expect(computePeriodSustained(line5).amPeak).toBe(false);
    expect(read(line5, false)).toEqual({ value: 20, sustained: false, uneven: false, filter: 20 });
    expect(slowFirstHourSetAside(line5, am.start, am.end)).toBe(true);
    expect(read(line5, true)).toEqual({ value: 4, sustained: true, uneven: false, filter: 4 });
  });

  it('reads the rush figure for a start-up whose last gap crosses the hour mark (TransLink 99, #602: gap 19)', () => {
    expect(read(translink99, false).filter).toBe(23);
    expect(read(translink99, true)).toMatchObject({ value: 3, sustained: true, filter: 3 });
  });

  it('reads the typical gap for a steady period that is uneven only because of its first hour (STM 18: gap 24)', () => {
    expect(read(stm18, false)).toMatchObject({ sustained: true, uneven: true, filter: 24 });
    expect(read(stm18, true)).toMatchObject({ sustained: true, uneven: false, filter: 10 });
  });

  it('a set-aside gap over 25 minutes stays the longest wait (STM 24: 6:01 to 6:34 is 33)', () => {
    expect(slowFirstHourSetAside(stm24, am.start, am.end)).toBe(false);
    expect(unchanged(stm24)).toMatchObject({ sustained: false, filter: 33 });
  });

  it('a lone early trip is not a start-up: three departures in the first hour, no set-aside gap over 25', () => {
    // 6:05, then every 10 from 7:00: a rider at 6:10 waits 50 minutes.
    const lone = [hm(6, 5), ...every(hm(7, 0), am.end, 10)];
    expect(slowFirstHourSetAside(lone, am.start, am.end)).toBe(false);
    expect(unchanged(lone).filter).toBe(55);
    // 6:50, 7:45, then every 7 (the TTC 22 Sunday shape).
    const two = [hm(6, 50), hm(7, 45), ...every(hm(7, 52), am.end, 7)];
    expect(slowFirstHourSetAside(two, am.start, am.end)).toBe(false);
    expect(unchanged(two).filter).toBe(55);
    // Two early trips 20 apart, then every 4: two departures are not three.
    const pair = [hm(6, 20), hm(6, 40), ...every(hm(7, 0), am.end, 4)];
    expect(slowFirstHourSetAside(pair, am.start, am.end)).toBe(false);
    unchanged(pair);
    // The wait from the period's start counts as a gap: first bus 6:26, then 6:40, 6:54, then every 4.
    const lateFirst = [hm(6, 26), hm(6, 40), hm(6, 54), ...every(hm(7, 0), am.end, 4)];
    expect(slowFirstHourSetAside(lateFirst, am.start, am.end)).toBe(false);
    unchanged(lateFirst);
  });

  it('three departures 24 apart, then every 3, meet the bounds and read 3 (the 25-minute bound is the owner\'s to lower)', () => {
    const times = [hm(6, 0), hm(6, 24), hm(6, 48), ...every(hm(6, 51), am.end, 3)];
    expect(read(times, false)).toMatchObject({ sustained: false, filter: 24 });
    expect(read(times, true)).toMatchObject({ value: 3, sustained: true, filter: 3 });
  });

  it('value and filter never split: a period whose service ends early keeps its full-window wait', () => {
    // The reviewer's sequence: 6:00, 6:30, then every 10 until 7:40. Nothing runs from 7:40 to 9:00.
    const reviewers = [hm(6, 0), hm(6, 30), ...every(hm(6, 40), hm(7, 40), 10)];
    expect(unchanged(reviewers)).toMatchObject({ value: 80, filter: 80 });
    // Inside the first-hour bounds, with the last trip 62 minutes before the period ends: 62 either way.
    const early = [hm(6, 0), hm(6, 24), hm(6, 48), ...every(hm(6, 54), hm(7, 58), 8)];
    expect(unchanged(early)).toMatchObject({ value: 62, filter: 62 });
    for (const times of [line5, translink99, stm18, stm24, stm51, reviewers, early]) {
      const on = read(times, true);
      expect(on.value).toBe(on.filter);
    }
  });

  it('a slow start of more than an hour still reads the longest wait (STM 51: 6:09 to 7:15)', () => {
    expect(unchanged(stm51).filter).toBe(20);
    // Every 20 from 6:06 to 7:26, then every 4.
    const long = [...every(hm(6, 6), hm(7, 26), 20), ...every(hm(7, 30), am.end, 4)];
    expect(unchanged(long).filter).toBe(20);
    // #1142's own case, from the start of service: every 15 for two hours, then every 4, stays uneven.
    const twoHours = [...every(am.start, am.start + 120, 15), ...every(am.start + 124, am.end, 4)];
    expect(read(twoHours, false).uneven).toBe(true);
    unchanged(twoHours);
  });

  it('Line 5 passes with a thin margin: its every-8.5 stretch after the first hour is under a quarter of the rest', () => {
    // As scheduled the slower stretch ends 7:27: three gaps of 8.5 after 7:02, 25.5 minutes of the 118 left (the limit is 29.5).
    expect(read(line5, true).filter).toBe(4);
    // One more 8.5 gap (the slower stretch to about 7:36) and the period reads 20 again.
    const oneMore = [...line5.filter(t => t <= 447.5), 456, ...every(460, am.end, 3.65)];
    expect(unchanged(oneMore).filter).toBe(20);
    // The slower stretch running to 7:45.
    const to745 = [...line5.filter(t => t <= 447.5), 456, 464.5, ...every(468, am.end, 3.65)];
    expect(unchanged(to745).filter).toBe(20);
  });

  it('a gap later in the period still reads the longest wait', () => {
    // Every 4 from 6:00, with nothing from 8:00 to 8:20.
    const laterGap = [...every(am.start, hm(8, 0), 4), ...every(hm(8, 20), am.end, 4)];
    expect(unchanged(laterGap).filter).toBe(20);
    // Line 5's start-up and the same 8:00 gap: the gap is not at the start of service.
    const both = line5.filter(t => t <= hm(8, 0) || t >= hm(8, 20));
    expect(slowFirstHourSetAside(both, am.start, am.end)).toBe(false);
    // 7:57 to 8:23 at this stop: the longest wait, with the switch on or off.
    expect(unchanged(both).filter).toBe(26);
  });

  it('a gap after earlier service is not a start-up, however the earlier trips are written', () => {
    // Buses from 4:20.
    const earlier = [hm(4, 20), hm(4, 40), hm(5, 0), hm(5, 20), hm(5, 40), ...line5];
    expect(slowFirstHourSetAside(earlier, am.start, am.end)).toBe(false);
    unchanged(earlier);
    // A stretch's list keeps a trip past midnight as written: 27:00 and 28:00 are 3:00 and 4:00 the next morning.
    const pastMidnight = [...line5, hm(27, 0), hm(28, 0)];
    expect(slowFirstHourSetAside(pastMidnight, am.start, am.end)).toBe(false);
    unchanged(pastMidnight);
    // The same trips in plain notation.
    expect(slowFirstHourSetAside([hm(3, 0), hm(4, 0), ...line5], am.start, am.end)).toBe(false);
    // A last trip at 25:30 (1:30) is the end of the night before, not earlier service: Line 5 still starts up at 6:06.
    expect(slowFirstHourSetAside([...line5, hm(25, 30)], am.start, am.end)).toBe(true);
    // Trips in the hour before the period are the same start-up (STM 18 starts 5:15), in either notation.
    expect(slowFirstHourSetAside([hm(5, 40), ...line5], am.start, am.end)).toBe(true);
    expect(slowFirstHourSetAside([...line5, hm(29, 40)], am.start, am.end)).toBe(true);
  });

  it('a route that is sparse all period is unchanged', () => {
    const every20 = every(hm(6, 6), am.end, 20);
    expect(unchanged(every20).filter).toBe(20);
    // Irregular all period: 6:06, 6:50, 7:20, 8:15, 8:40.
    const irregular = [hm(6, 6), hm(6, 50), hm(7, 20), hm(8, 15), hm(8, 40)];
    expect(slowFirstHourSetAside(irregular, am.start, am.end)).toBe(false);
    unchanged(irregular);
    // Every 20 for the first hour, then every 15: steady already, and never reads better than 15.
    const slow = [...every(hm(6, 5), hm(6, 45), 20), ...every(hm(7, 0), am.end, 15)];
    expect(unchanged(slow).filter).toBe(15);
  });

  it('the slow first hour a steady period already forgives is unchanged (MBTA 7 AM)', () => {
    const mbta7 = [...every(am.start, am.start + 60, 15), ...every(am.start + 64, am.end, 4)];
    expect(computePeriodSustained(mbta7).amPeak).toBe(true);
    expect(unchanged(mbta7).filter).toBe(4);
  });

  it('does not apply after midnight (late evening and overnight keep their own rules)', () => {
    const late = PERIOD_MINUTES.late;
    const times = [late.start + 6, late.start + 26, late.start + 46, ...every(late.start + 62, late.end, 4)];
    expect(slowFirstHourSetAside(times, late.start, late.end)).toBe(false);
  });

  describe('branches keep their say', () => {
    // A trunk like Line 5 whose branch takes every other trip: 6:06, 6:46, then about every 7 once the trunk runs every 3.6.
    const everyOther = line5.filter((_, i) => i % 2 === 0);
    // A branch that takes all three start-up trips, then every other one: 20, 20, 16, 17, 13, then about every 7.
    const startsWithTrunk = [...line5.slice(0, 3), ...line5.slice(3).filter((_, i) => i % 2 === 1)];

    it('a slow-starting branch that does not pass the test decides its direction as without the rule', () => {
      expect(read(line5, false, [everyOther])).toMatchObject({ value: 20, filter: 20 });
      // Its first hour holds two trips 40 apart: nothing is set aside, on the trunk or the branch.
      expect(slowFirstHourSetAside(everyOther, am.start, am.end)).toBe(false);
      expect(unchanged(line5, [everyOther])).toMatchObject({ value: 20, sustained: false, filter: 20 });
      vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', '1');
      expect(directionSlowStart(direction(line5, [everyOther]))).toBeNull();
    });

    it('a branch that passes the same test is set aside with the trunk and speaks at its own gap', () => {
      expect(read(line5, false, [startsWithTrunk]).filter).toBe(20);
      const on = read(line5, true, [startsWithTrunk]);
      // The branch's typical gap, not the trunk's 4.
      expect(on).toMatchObject({ value: 7, sustained: true, filter: 7 });
      expect(directionSlowStart(direction(line5, [startsWithTrunk]))).toEqual({ main: { amPeak: true }, tails: [{ amPeak: true }] });
    });

    it('a branch that already speaks for its direction is untouched, and stray trips on a branch decide nothing', () => {
      // A steady branch every 12 from 6:00: the direction reads the slower branch, 12.
      const steady = every(am.start, am.end, 12);
      expect(read(line5, false, [steady]).filter).toBe(20);
      expect(read(line5, true, [steady])).toMatchObject({ value: 12, filter: 12 });
      // Two trips to a branch (6:30 and 8:30) are not service through the period.
      expect(read(line5, true, [[hm(6, 30), hm(8, 30)]]).filter).toBe(4);
    });

    it('a tail is never set aside where the main stretch is not (TTC 68 northbound AM stayed 8)', () => {
      const trunk = every(am.start, am.end, 8);
      expect(unchanged(trunk, [line5]).filter).toBe(8);
    });
  });

  describe('one decision, read everywhere', () => {
    it('a stretch never decides for itself: without the direction\'s decision it reads the settled checks', () => {
      vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', '1');
      expect(stretchPeriods(main(line5)).amPeak).toMatchObject({ value: 20, sustained: false });
      expect(stretchPeriods(tail(line5)).amPeak).toMatchObject({ value: 20, sustained: false, counts: false });
      expect(stretchPeriods(main(line5), { amPeak: true }).amPeak).toMatchObject({ value: 4, sustained: true, sustainedMid: true, uneven: false, oneGap: false });
      // A decision for a period that is steady already changes nothing.
      const steady = every(am.start, am.end, 8);
      expect(stretchPeriods(main(steady), { amPeak: true })).toEqual(stretchPeriods(main(steady)));
    });

    it('the card row\'s stretch slot reads the decision, and keeps the period\'s real longest gap', () => {
      vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', '1');
      expect(stretchMetaPeriods(main(line5)).period.amPeak).toBe(20);
      const slot = stretchMetaPeriods(main(line5), { amPeak: true });
      expect(slot.period.amPeak).toBe(4);
      expect(slot.maxGap.amPeak).toBe(20);
      expect(slot.noRegular).not.toContain('amPeak');
    });

    const stamped = (on: boolean, row: Record<string, unknown> = {}) => {
      vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', on ? '1' : '');
      const d = direction(line5);
      const feature = { properties: {
        headwayByPeriod: { amPeak: 4 }, maxGapByPeriod: { amPeak: 20 },
        headwayByPeriodSustained: { amPeak: false }, headwayByPeriodSustainedMid: { amPeak: false }, ...row,
      } as Record<string, unknown> };
      stampStretchShadow([feature], new Map([[d.key, d]]), () => ({ group: 'r', dirId: '1', day: 'Weekday' }), () => ['s']);
      const p = feature.properties as Record<string, Record<string, unknown>>;
      return {
        role: feature.properties.stretchRole, filter: p.directionFilterHeadwayByPeriod.amPeak, routeFilter: p.routeFilterHeadwayByPeriod.amPeak,
        steady: p.headwayByPeriodSustained.amPeak, mid: p.headwayByPeriodSustainedMid.amPeak, stretchSteady: p.stretchPeriodSustained.amPeak,
        longestGap: p.maxGapByPeriod.amPeak, slot: (p.stretchMeta.main as { period: Record<string, number>; maxGap: Record<string, number> }),
      };
    };

    it('the row\'s steady flag, its stretch slot and the filter figure agree, with the switch on and off', () => {
      const off = stamped(false);
      expect(off).toMatchObject({ role: 'main', filter: 20, routeFilter: 20, steady: false, mid: false, stretchSteady: false, longestGap: 20 });
      expect(off.slot.period.amPeak).toBe(20);
      const on = stamped(true);
      // Never "unsteady" beside a figure of 4: the row reads steady where the filter reads the typical gap.
      expect(on).toMatchObject({ role: 'main', filter: 4, routeFilter: 4, steady: true, mid: true, stretchSteady: true, longestGap: 20 });
      expect(on.slot.period.amPeak).toBe(4);
      expect(on.slot.maxGap.amPeak).toBe(20);
    });

    it('a row with a figure of its own keeps its own verdict', () => {
      // A row whose own trips run every 9 on a stretch every 4 is not the stretch's trips read at another stop.
      expect(stamped(true, { headwayByPeriod: { amPeak: 9 } })).toMatchObject({ filter: 4, steady: false, mid: false });
    });

    it('a row is never read steady where the direction is not set aside', () => {
      vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', '1');
      const d = direction(stm24);
      const feature = { properties: { headwayByPeriod: { amPeak: 9 }, headwayByPeriodSustained: { amPeak: false }, headwayByPeriodSustainedMid: { amPeak: false } } as Record<string, unknown> };
      stampStretchShadow([feature], new Map([[d.key, d]]), () => ({ group: 'r', dirId: '1', day: 'Weekday' }), () => ['s']);
      const p = feature.properties as Record<string, Record<string, unknown>>;
      expect(p.directionFilterHeadwayByPeriod.amPeak).toBe(33);
      expect(p.headwayByPeriodSustained.amPeak).toBe(false);
    });

    it('the stops along a stretch read its decision, not one of their own', () => {
      vi.stubEnv('ATLAS_SLOW_FIRST_HOUR_UNSTEADY', '1');
      // The same trips 34 minutes down the line: 6:40, 7:00, 7:20, then the rush.
      const downstream = line5.map(t => t + 34).filter(t => t < 22 * 60);
      const through = (stops: readonly string[]) => stops.map(stop => ({ times: stop === 'far' ? downstream : line5, nightTimes: [], tripCount: line5.length }));
      const alone = stopPeriodValues(['s', 'far'], through);
      expect(alone.amPeak).toBe('20,40');
      const decided = stopPeriodValues(['s', 'far'], through, undefined, undefined, () => ({ amPeak: true }));
      expect(decided.amPeak).toBe('4*2');
    });
  });
});

describe('stretch values for an uneven period (#1142)', () => {
  it('reads the longest wait for colour and filters, and publishes the typical gap', () => {
    const p = stretchPeriods(main(ttc320)).midday;
    expect(p.uneven).toBe(true);
    expect(p.headway).toBe(5);
    expect(p.value).toBe(p.coverage);
    expect(stretchFilterValue(p)).toBe(p.coverage);
    const dir = rollupDirection({ key: 'r::0::Weekday', main: main(ttc320), tails: [], regularPatternCount: 1, variantTripCount: 0 } as never)!;
    expect(dir.period.midday.filterValue).toBe(p.coverage);
    expect(dir.period.midday.typical).toBe(5);
    expect(dir.period.midday.edge).toBeNull();
    // The route range reads typical to worst: the card's "every 5–N".
    expect(rollupRoute([dir]).period.midday.range).toEqual([5, p.coverage]);
  });

  it('leaves a steady period as it was', () => {
    const p = stretchPeriods(main(every(start, end, 10))).midday;
    expect(p.uneven).toBe(false);
    expect(p.value).toBe(10);
    const dir = rollupDirection({ key: 'r::0::Weekday', main: main(every(start, end, 10)), tails: [], regularPatternCount: 1, variantTripCount: 0 } as never)!;
    expect(dir.period.midday.filterValue).toBe(10);
    expect(dir.period.midday.typical).toBeNull();
  });
});

describe('an uneven tail reads its longest gap between its own departures (NYC 6 Pelham Bay, batch 2 dry run)', () => {
  it('leaves out the lead-in before its first departure; a main stretch with service before the window keeps it', () => {
    // The tail's evening starts 41 minutes in, then runs 14, 14, 11, 8, 18, 18, ... (its gaps from 603N).
    const gaps = [14, 14, 11, 8, 4, 8, 18, 18, 6, 10, 5, 7, 3, 10, 5, 6, 6, 5, 4, 5, 10, 5, 7, 6];
    const ev = PERIOD_MINUTES.evening;
    const times = gaps.reduce((acc, g) => [...acc, acc[acc.length - 1] + g], [ev.start + 41]);
    const tail = stretchPeriods({ ...main(times), kind: 'tail' }).evening;
    expect(tail.uneven).toBe(true);
    expect(tail.value).toBe(18);
    expect(stretchFilterValue(tail)).toBe(18);
    // CIV-1064: the same departures as a main stretch with a departure before 19:00 (service continues
    // from the PM peak): the 41 minutes from 19:00 are a real wait the window cuts, and still count.
    const asMain = stretchPeriods(main([ev.start - 20, ...times])).evening;
    expect(asMain.uneven).toBe(true);
    expect(asMain.value).toBe(asMain.coverage);
    expect(asMain.coverage).toBeGreaterThanOrEqual(41);
  });
});

describe('an uneven main stretch leaves out only a true start or end of its service (CIV-1064, TTC 320 overnight)', () => {
  const on = PERIOD_MINUTES.overnight;
  // TTC 320 weekday overnight northbound at Eglinton (8980), from the feed: night service only. The
  // first bus is 2:15 (2:13 in the feed), then every 5 to 3:40, every 15 to 5:10, then 5:17, 5:25, 5:32 and nothing after.
  const night = [...every(on.start + 15, on.start + 100, 5), ...every(on.start + 115, on.start + 190, 15), on.start + 197, on.start + 205, on.start + 212];
  const dirOf = (times: number[]) => rollupDirection({ key: 'r::1::Weekday', main: main(times), tails: [], regularPatternCount: 1, variantTripCount: 0 } as never)!;

  it('reads the longest gap between buses, not the run from the last bus to 6:00', () => {
    const p = stretchPeriods(main(night)).overnight;
    expect(p.uneven).toBe(true);
    expect(p.coverage).toBe(28);
    expect(p.value).toBe(15);
    expect(stretchFilterValue(p)).toBe(15);
    const dir = dirOf(night);
    expect(dir.period.overnight.filterValue).toBe(15);
    expect(dir.period.overnight.typical).toBe(5);
  });

  it('keeps the wait at a window boundary when the stretch runs on the other side of it', () => {
    // The morning's first bus at 6:10: the 28 minutes from 5:32 to 6:00 are a real gap the window cuts.
    const after = stretchPeriods(main([...night, on.end + 10])).overnight;
    expect(after.uneven).toBe(true);
    expect(after.value).toBe(28);
    // An evening bus at 1:40: the 13 minutes from 2:00 count, and the end still does not.
    expect(stretchPeriods(main([on.start - 20, ...night])).overnight.value).toBe(15);
  });

  it('keeps a long first gap between buses at a true start (#568: the opening gap is a gap)', () => {
    // Service starts at 2:00 sharp, and the second bus is 18 minutes later.
    const times = [on.start, on.start + 18, ...night.filter(t => t > on.start + 18)];
    const p = stretchPeriods(main(times)).overnight;
    expect(p.uneven).toBe(true);
    expect(p.value).toBe(18);
  });

  it('keeps the full-window wait when a true start is longer than the coverage cap, as a steady period does', () => {
    // Night service starts at 3:10, every 10 to 4:30, then every 22.
    const late = [...every(on.start + 70, on.start + 150, 10), ...every(on.start + 170, on.start + 238, 22)];
    const p = stretchPeriods(main(late)).overnight;
    expect(p.uneven).toBe(true);
    expect(p.coverage).toBe(70);
    expect(p.value).toBe(70);
    expect(stretchFilterValue(p)).toBe(70);
  });

  it('leaves a tail as it was (NYC 6: no guard on its edges)', () => {
    expect(stretchPeriods({ ...main([...night, on.end + 10]), kind: 'tail' }).overnight.value).toBe(15);
  });
});

