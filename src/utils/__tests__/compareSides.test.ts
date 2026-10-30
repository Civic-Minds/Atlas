import { describe, expect, it } from 'vitest';
import { compareSideHeading, defaultCompareSide, frequencyWords, type CompareSide } from '../compareSides';

const side = (over: Partial<CompareSide> = {}): CompareSide => ({ day: 'Weekday', period: 'late', maxHeadway: 10, ...over });

describe('compare side labels', () => {
  it('spells out each side: day, time and frequency', () => {
    expect(compareSideHeading(side())).toBe('Weekday late · ≤10 min');
    expect(compareSideHeading(side({ maxHeadway: Infinity, period: 'all' }))).toBe('Weekday, all day · All');
    expect(frequencyWords(15)).toBe('≤15 min');
  });
});

describe('starting compare', () => {
  it('B copies A, on a different day', () => {
    expect(defaultCompareSide(side())).toEqual({ day: 'Saturday', period: 'late', maxHeadway: 10 });
    expect(defaultCompareSide(side({ day: 'Saturday', maxHeadway: 15 }))).toEqual({ day: 'Sunday', period: 'late', maxHeadway: 15 });
  });
});
