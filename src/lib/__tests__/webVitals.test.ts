import { describe, expect, it } from 'vitest';
import { clsFromShifts, goodThresholdText, inpFromEvents, vitalRating } from '../webVitals';

describe('web vitals (CIV-2076)', () => {
  it('rates against Google’s thresholds, good inclusive', () => {
    expect(vitalRating('lcp', 2500)).toBe('Good');
    expect(vitalRating('lcp', 2501)).toBe('Needs improvement');
    expect(vitalRating('lcp', 4001)).toBe('Poor');
    expect(vitalRating('inp', 200)).toBe('Good');
    expect(vitalRating('cls', 0.1)).toBe('Good');
    expect(vitalRating('cls', 0.3)).toBe('Poor');
    expect(vitalRating('inp', null)).toBeNull();
  });

  it('shows the good threshold in the unit people read it in', () => {
    expect(goodThresholdText('lcp')).toBe('≤ 2.5 s');
    expect(goodThresholdText('inp')).toBe('≤ 200 ms');
    expect(goodThresholdText('cls')).toBe('≤ 0.1');
  });

  it('CLS is the largest burst, skipping shifts after input', () => {
    const shifts = [
      { startTime: 0, value: 0.05, hadRecentInput: false },
      { startTime: 500, value: 0.05, hadRecentInput: false },
      { startTime: 3000, value: 0.02, hadRecentInput: false }, // new burst after a 1 s gap
      { startTime: 3100, value: 0.5, hadRecentInput: true },
    ];
    expect(clsFromShifts(shifts)).toBeCloseTo(0.1);
    expect(clsFromShifts([])).toBe(0);
  });

  it('INP counts each interaction once at its longest event and takes the slowest', () => {
    expect(inpFromEvents([
      { interactionId: 1, duration: 40 },
      { interactionId: 1, duration: 120 },
      { interactionId: 2, duration: 80 },
      { interactionId: 0, duration: 900 }, // not an interaction
    ])).toBe(120);
    expect(inpFromEvents([])).toBeNull();
  });
});
