import { describe, expect, it } from 'vitest';
import { compareCardFacts, compareSideHeading, defaultCompareSide, frequencyWords, type CompareSide } from '../compareSides';

const side = (over: Partial<CompareSide> = {}): CompareSide => ({ day: 'Weekday', period: 'late', maxHeadway: 10, ...over });

describe('compare side labels', () => {
  it('spells out each side: day, time and frequency', () => {
    expect(compareSideHeading(side())).toBe('Weekday night · ≤10 min');
    expect(compareSideHeading(side({ maxHeadway: Infinity, period: 'all' }))).toBe('Weekday, all day · All');
    expect(frequencyWords(15)).toBe('≤15 min');
  });

  const row = (label: 'A' | 'B', settings: CompareSide, passes: boolean, headway: number | null = 16, runs = true) =>
    ({ label, settings, passes, headway, runs });

  it("route card facts line: the side, its day and time, and the route's frequency there (CIV-844)", () => {
    expect(compareCardFacts(row('A', side({ period: 'pmPeak' }), true, 3))).toBe('A · Weekday PM peak · every 3 min');
    expect(compareCardFacts(row('B', side({ day: 'Saturday', period: 'pmPeak' }), false, 4))).toBe('B · Saturday PM peak · every 4 min');
    expect(compareCardFacts(row('B', side({ day: 'Sunday' }), false, null))).toBe('B · Sunday night · no regular service');
    expect(compareCardFacts(row('A', side(), false, null, false))).toBe('A · Weekday night · no service');
  });
});

describe('starting compare', () => {
  it('B copies A, on a different day', () => {
    expect(defaultCompareSide(side())).toEqual({ day: 'Saturday', period: 'late', maxHeadway: 10 });
    expect(defaultCompareSide(side({ day: 'Saturday', maxHeadway: 15 }))).toEqual({ day: 'Sunday', period: 'late', maxHeadway: 15 });
  });
});
