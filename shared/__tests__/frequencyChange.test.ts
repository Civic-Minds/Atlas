import { describe, expect, it } from 'vitest';
import { frequencyChange, STARTS_OR_STOPS_STEPS } from '../frequencyChange';
import { TIER_MAXES } from '../rules/frequency';

describe('frequencyChange: a route changes when it moves grade on the one scale (CIV-1814 item 38)', () => {
  it('a move inside one grade is no change (Hamilton 44, 30 → 29)', () => {
    expect(frequencyChange(30, 29)).toBeNull();
    expect(frequencyChange(16, 20)).toBeNull();
    expect(frequencyChange(61, 120)).toBeNull();
    expect(frequencyChange(null, undefined)).toBeNull();
  });

  it('a move across a grade counts, and bigger jumps rank higher', () => {
    expect(frequencyChange(31, 29)).toMatchObject({ before: 60, after: 30, steps: 1, better: true, publicChange: true });
    expect(frequencyChange(10, 30)).toMatchObject({ before: 10, after: 30, steps: 3, better: false, publicChange: true });
    expect(frequencyChange(5, 90)!.steps).toBe(TIER_MAXES.length);
    expect(frequencyChange(15, 20)!.steps).toBeLessThan(frequencyChange(10, 30)!.steps);
  });

  it('internal grades count but are marked as no public change (10 → 5 still reads 10)', () => {
    expect(frequencyChange(10, 5)).toMatchObject({ before: 10, after: 5, steps: 2, better: true, publicChange: false });
    expect(frequencyChange(8, 6)).toBeNull();
    expect(frequencyChange(11, 8)).toMatchObject({ steps: 2, publicChange: true });
  });

  it('service starting or stopping outranks any grade move', () => {
    expect(frequencyChange(null, 12)).toMatchObject({ before: 'none', after: 15, steps: STARTS_OR_STOPS_STEPS, better: true });
    expect(frequencyChange(12, null)).toMatchObject({ before: 15, after: 'none', better: false });
    expect(STARTS_OR_STOPS_STEPS).toBeGreaterThan(frequencyChange(5, 200)!.steps);
  });
});
