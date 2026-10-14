import { describe, expect, it } from 'vitest';
import { decideHeadline, decidePeriod, liftTierOnDestinationPool, settleTier, terminalReading, type HeadlineInputs, type PeriodInputs } from '../routeGrading';

// Step 4 of processGtfsBuffer as named steps, each on the case that introduced it.

const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

describe('terminalReading', () => {
  it('prefers the midday value, then the Step 1 window order, then the stop median', () => {
    const own = every(360, 1320, 20);
    const r = terminalReading({ terminalId: 't', ownTerminalTimes: own, pool: null, ownStopHwsSorted: [18, 20, 22] });
    expect(r).toMatchObject({ ownTerminalMiddayHw: 20, terminalHw: 20, terminalMiddayHw: 20, allStopMedian: 20, terminalComputedHw: 20 });
    // No terminal: the stop median.
    expect(terminalReading({ terminalId: undefined, ownTerminalTimes: [], pool: null, ownStopHwsSorted: [10, 30] }).terminalComputedHw).toBe(20);
    // A pool is read with the pooled rule (never better than the mean gap) and the own midday
    // value is still reported for the thin-sample test.
    const pooled = [...every(360, 1320, 30), ...every(375, 1305, 60)].sort((a, b) => a - b);
    const p = terminalReading({ terminalId: 't', ownTerminalTimes: every(360, 1320, 30), pool: pooled, ownStopHwsSorted: [30] });
    expect(p.ownTerminalMiddayHw).toBe(30);
    expect(p.terminalComputedHw).toBe(20);
    expect(p.poolUsed).toBe(true);
  });

  it('a pool that adds nothing in the window reads as the own pattern, without the mean floor (ttc 41 Saturday)', () => {
    // Every 8 with one 16-minute gap, 37 departures 9-15h: the pool's five extra trips are all
    // outside the window, so the merged list is the own list there and reads its typical 8,
    // not the mean-floored 10 a merged list would carry.
    const own = every(540, 900, 8).filter(t => t !== 700);
    const pool = [...own, 300, 320, 340, 1500, 1520].sort((a, b) => a - b);
    const r = terminalReading({ terminalId: 't', ownTerminalTimes: own, pool, ownStopHwsSorted: [8] });
    expect(r.poolUsed).toBe(true);
    expect(r.terminalComputedHw).toBe(8);
  });

  it('#813: a pool whose merged midday list is uneven leaves the own reading in place', () => {
    // ttc 129 weekday at Steeles: the own shape every 20 at midday; merged with a second
    // shape the list has a 30-minute hole against a 20 typical, so the pool is not read and the
    // own midday 20 stands rather than the pool's later-window 28.
    const own = every(540, 900, 20);
    // The second shape adds a burst at 10:00 and nothing else, so the merged list keeps the
    // 20-minute gaps but its mean drops: the mean guard lets it through and the 20s exceed
    // 1.5x the floored value only when the floor falls below 14. Use a hole instead: the
    // merged list is every 20 until 11:00, then nothing until 12:00.
    const pool = own.filter(t => t <= 660 || t >= 720);
    const r = terminalReading({ terminalId: 't', ownTerminalTimes: own, pool, ownStopHwsSorted: [20] });
    expect(r.poolUsed).toBe(false);
    expect(r.terminalComputedHw).toBe(20);
  });

});

const inputs = (over: Partial<HeadlineInputs> = {}): HeadlineInputs => ({
  unevenMiddayTerminal: false, branchHw: 20, branchTripCount: 40, terminalComputedHw: 20, hasPool: false, thinTerminalSample: false, scoped: null,
  worstDrawnStopHw: undefined, plainTerminalComputedHw: 20, plainNonTerminalStopHws: [20, 20], pooledPlainTerminalHw: 20, ...over,
});

describe('decideHeadline', () => {
  it('a thin terminal sample keeps the branch value or its rescue reading (metrolink Riverside, ttc 35B)', () => {
    expect(decideHeadline(inputs({ thinTerminalSample: true, scoped: null, branchHw: 30 }))).toBe(30);
    expect(decideHeadline(inputs({ thinTerminalSample: true, scoped: { headway: 15, tier: '15' }, branchHw: 10 }))).toBe(15);
  });
  it('a destination pool is floored at the worst drawn stop some variants skip (#771, MTA Silver)', () => {
    expect(decideHeadline(inputs({ hasPool: true, terminalComputedHw: 20, worstDrawnStopHw: 40 }))).toBe(40);
    expect(decideHeadline(inputs({ hasPool: true, terminalComputedHw: 20, worstDrawnStopHw: 12 }))).toBe(20);
    expect(decideHeadline(inputs({ hasPool: true, terminalComputedHw: 20, worstDrawnStopHw: undefined }))).toBe(20);
    // A drawn stop with no all-day value (a peak-only outer tail) is the worst there is: no headline.
    expect(decideHeadline(inputs({ hasPool: true, terminalComputedHw: 20, worstDrawnStopHw: null }))).toBeNull();
  });
  it('otherwise the #772 branch decision stands (a shared terminal never overrides a genuine branch)', () => {
    // Trunk stops every 10, terminal every 10 only because another branch shares it: the branch's own 20 stands.
    expect(decideHeadline(inputs({ terminalComputedHw: 10, plainTerminalComputedHw: 10, plainNonTerminalStopHws: [20, 20, 20, 20], branchHw: 20, pooledPlainTerminalHw: 10 }))).toBe(20);
    // A flat route: terminal and branch agree.
    expect(decideHeadline(inputs({ terminalComputedHw: 20 }))).toBe(20);
  });
});

describe('settleTier', () => {
  it('a null headline leaves the tier alone', () => {
    expect(settleTier('30', null, null)).toBe('30');
  });
  it('only degrades a tier (AI-220: Halifax 330 peaks never promote an infrequent route)', () => {
    expect(settleTier('15', 25, null)).toBe('30');
    expect(settleTier('30', 12, null)).toBe('30');
    expect(settleTier('infrequent', 12, null)).toBe('infrequent');
  });
  it('a thin shape phase 2 could not grade takes its rescue sample\'s finite tier (capmetro 2)', () => {
    expect(settleTier('infrequent', 16, { tier: '30' })).toBe('30');
    expect(settleTier('60', 16, { tier: '30' })).toBe('60');
    expect(settleTier('infrequent', 16, { tier: 'infrequent' })).toBe('infrequent');
  });
});

describe('liftTierOnDestinationPool', () => {
  const stops = ['a', 'b', 'c'];
  it('lifts to the pool\'s worst drawn-stop grade, never past the headline', () => {
    expect(liftTierOnDestinationPool({ currentTier: '60', headway: 16, day: 'Weekday', drawnStopIds: stops, gradeAt: () => '15', otherWeekdays: () => [] })).toBe('20');
    expect(liftTierOnDestinationPool({ currentTier: '60', headway: 8, day: 'Weekday', drawnStopIds: stops, gradeAt: s => (s === 'b' ? '30' : '15'), otherWeekdays: () => [] })).toBe('30');
    // Never worse than the current tier.
    expect(liftTierOnDestinationPool({ currentTier: '20', headway: 8, day: 'Saturday', drawnStopIds: stops, gradeAt: () => '30', otherWeekdays: () => [] })).toBe('20');
  });
  it('a drawn stop with no grade, or another weekday that fails, refuses the lift (septa 2, septa T2)', () => {
    expect(liftTierOnDestinationPool({ currentTier: '60', headway: 8, day: 'Weekday', drawnStopIds: stops, gradeAt: s => (s === 'a' ? null : '15'), otherWeekdays: () => [] })).toBe('60');
    const tue = { name: 'Tuesday' as const, tripIds: new Set(['t']) };
    expect(liftTierOnDestinationPool({ currentTier: '60', headway: 8, day: 'Weekday', drawnStopIds: stops, gradeAt: (_, w) => (w ? '30' : '15'), otherWeekdays: () => [tue] })).toBe('30');
    expect(liftTierOnDestinationPool({ currentTier: '60', headway: 8, day: 'Weekday', drawnStopIds: stops, gradeAt: (_, w) => (w ? null : '15'), otherWeekdays: () => [tue] })).toBe('60');
    // Other weekdays are only consulted for Weekday lines.
    expect(liftTierOnDestinationPool({ currentTier: '60', headway: 8, day: 'Saturday', drawnStopIds: stops, gradeAt: (_, w) => (w ? null : '15'), otherWeekdays: () => [tue] })).toBe('15');
  });
});

const periodInputs = (over: Partial<PeriodInputs> = {}): PeriodInputs => ({
  termH: 20, branchH: 30, terminalIsBranchScoped: true, worstDrawnStop: null, terminalCoverage: 25, branchCoverage: 35,
  hasScopedTimes: true, termMaxGap: 24, branchMaxGap: 40, termSustained: true, branchSustained: false, ...over,
});

describe('decidePeriod', () => {
  it('reads the branch-scoped terminal value and carries its companions (#281)', () => {
    expect(decidePeriod(periodInputs())).toEqual({ headway: 20, coverage: 25, maxGap: 24, sustained: true });
    // No terminal value: the branch's own value and companions, but a scoped null coverage is
    // real no-service, never borrowed from the branch.
    expect(decidePeriod(periodInputs({ termH: null, terminalCoverage: null }))).toEqual({ headway: 30, coverage: null, maxGap: 40, sustained: false });
  });
  it('a period from the destination pool is floored at the worst drawn stop, companions included (#771)', () => {
    const worst = { headway: 40, coverage: 45, maxGap: 52, sustained: false };
    // The floored period is that stop's reading: its coverage, max gap and sustained flag go with it.
    expect(decidePeriod(periodInputs({ worstDrawnStop: worst }))).toEqual(worst);
    // A better stop changes nothing: the terminal's value and companions stand.
    expect(decidePeriod(periodInputs({ worstDrawnStop: { ...worst, headway: 12 } }))).toEqual({ headway: 20, coverage: 25, maxGap: 24, sustained: true });
    // A stop with no value this period (a peak-only tail at midday) makes the period no service.
    const none = { headway: null, coverage: 130, maxGap: 150, sustained: undefined };
    expect(decidePeriod(periodInputs({ worstDrawnStop: none }))).toEqual(none);
    // No terminal or branch value: the stop's floor has nothing to raise.
    expect(decidePeriod(periodInputs({ termH: null, branchH: null, worstDrawnStop: worst })).headway).toBeNull();
  });
});
