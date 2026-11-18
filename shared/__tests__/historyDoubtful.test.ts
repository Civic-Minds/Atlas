import { describe, expect, it } from 'vitest';
import { doubtfulParts } from '../historyDoubtful';

describe('doubtful History figures (CIV-1847)', () => {
  it("flags Kingston 12's every 5 in a schedule that otherwise runs every 24 to 30", () => {
    expect([...doubtfulParts({ amPeak: 24, midday: 5, pmPeak: 26, evening: 30 })]).toEqual(['midday']);
  });
  it('leaves a schedule with only one time of day alone', () => {
    expect(doubtfulParts({ midday: 5 }).size).toBe(0);
  });
  it('leaves an evenly frequent route and an ordinary peak alone', () => {
    expect(doubtfulParts({ amPeak: 10, midday: 15, pmPeak: 10, evening: 20 }).size).toBe(0);
    expect(doubtfulParts({ amPeak: 8, midday: 15, pmPeak: 8, evening: 20, late: 30 }).size).toBe(0);
  });
  it('flags at a quarter of the typical wait, not above it', () => {
    expect(doubtfulParts({ amPeak: 7.5, midday: 30, evening: 30 }).has('amPeak')).toBe(true);
    expect(doubtfulParts({ amPeak: 8, midday: 30, evening: 30 }).has('amPeak')).toBe(false);
  });
});
