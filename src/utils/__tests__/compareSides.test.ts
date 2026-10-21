import { describe, expect, it } from 'vitest';
import { compareCardSummary, compareOtherPhrase, compareSideHeading, defaultCompareSide, frequencyWords, type CompareSide } from '../compareSides';

const side = (over: Partial<CompareSide> = {}): CompareSide => ({ day: 'Weekday', period: 'late', maxHeadway: 10, ...over });

describe('compare side labels', () => {
  it('spells out each side: day, time and frequency', () => {
    expect(compareSideHeading(side())).toBe('Weekday night · ≤10 min');
    expect(compareSideHeading(side({ maxHeadway: Infinity, period: 'all' }))).toBe('Weekday, all day · All routes');
    expect(frequencyWords(15)).toBe('≤15 min');
  });

  it('names the one setting that differs in the "not on" text', () => {
    expect(compareOtherPhrase(side(), side({ day: 'Saturday' }), 'B')).toBe('on Saturday');
    expect(compareOtherPhrase(side(), side({ period: 'midday' }), 'B')).toBe('during midday');
    expect(compareOtherPhrase(side(), side({ maxHeadway: 15 }), 'B')).toBe('at every 15 min or better');
    expect(compareOtherPhrase(side({ maxHeadway: 15 }), side(), 'A')).toBe('at every 10 min or better');
  });

  it('names the other map when more than one setting differs, or nothing does', () => {
    expect(compareOtherPhrase(side(), side({ day: 'Sunday', maxHeadway: 15 }), 'B')).toBe('on map B');
    expect(compareOtherPhrase(side(), side(), 'A')).toBe('on map A');
    expect(compareOtherPhrase(side(), side({ maxHeadway: Infinity }), 'B')).toBe('on map B');
  });

  const row = (label: 'A' | 'B', settings: CompareSide, passes: boolean, headway: number | null = 16, runs = true) =>
    ({ label, settings, passes, headway, runs });

  it('route card, same day and time: frequency once, then which maps draw it', () => {
    const summary = compareCardSummary([row('A', side(), false), row('B', side({ maxHeadway: 20 }), true)]);
    expect(summary).toEqual({ headline: 'Every 16 min', lines: ['On map B (≤20 min) · not on map A (≤10 min)'] });
    expect(compareCardSummary([row('A', side(), true, 8), row('B', side({ maxHeadway: Infinity }), true, 8)]).lines)
      .toEqual(['On map A (≤10 min) · on map B (All routes)']);
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
