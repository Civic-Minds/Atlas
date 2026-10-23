import { describe, expect, it } from 'vitest';
import { compareCardSummary, compareSideHeading, defaultCompareSide, frequencyWords, type CompareSide } from '../compareSides';

const side = (over: Partial<CompareSide> = {}): CompareSide => ({ day: 'Weekday', period: 'late', maxHeadway: 10, ...over });

describe('compare side labels', () => {
  it('spells out each side: day, time and frequency', () => {
    expect(compareSideHeading(side())).toBe('Weekday night · ≤10 min');
    expect(compareSideHeading(side({ maxHeadway: Infinity, period: 'all' }))).toBe('Weekday, all day · All');
    expect(frequencyWords(15)).toBe('≤15 min');
  });

  const row = (label: 'A' | 'B', settings: CompareSide, passes: boolean, headway: number | null = 16, runs = true) =>
    ({ label, settings, passes, headway, runs });

  it('route card, same day and time: frequency once, then which maps draw it', () => {
    const summary = compareCardSummary([row('A', side(), false), row('B', side({ maxHeadway: 20 }), true)]);
    expect(summary).toEqual({ headline: 'Every 16 min', lines: ['On map B (≤20 min) · not on map A (≤10 min)'] });
    expect(compareCardSummary([row('A', side(), true, 8), row('B', side({ maxHeadway: Infinity }), true, 8)]).lines)
      .toEqual(['On map A (≤10 min) · on map B (All)']);
  });

  it('route card, different day or time: one line per side with its own frequency', () => {
    const summary = compareCardSummary([
      row('A', side({ period: 'midday' }), true, 16),
      row('B', side({ day: 'Saturday' }), false, 40),
    ]);
    expect(summary).toEqual({
      headline: null,
      lines: ['A · Weekday midday: every 16 min, on map', 'B · Saturday night: every 40 min, not on map'],
    });
    expect(compareCardSummary([row('A', side(), true, 8), row('B', side({ day: 'Sunday', maxHeadway: 20 }), false, null, false)]).lines)
      .toEqual(['A · Weekday night · ≤10 min: every 8 min, on map', 'B · Sunday night · ≤20 min: no service, not on map']);
  });
});

describe('starting compare', () => {
  it('B copies A, on a different day', () => {
    expect(defaultCompareSide(side())).toEqual({ day: 'Saturday', period: 'late', maxHeadway: 10 });
    expect(defaultCompareSide(side({ day: 'Saturday', maxHeadway: 15 }))).toEqual({ day: 'Sunday', period: 'late', maxHeadway: 15 });
  });
});
