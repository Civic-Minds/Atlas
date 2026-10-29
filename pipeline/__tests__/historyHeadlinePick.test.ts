import { describe, expect, it } from 'vitest';
import { historyHeadlineWins } from '../historyHeadlinePick';

const NONE = { amPeak: null, midday: null, pmPeak: null, evening: null, late: null, overnight: null };

describe('historyHeadlineWins (CIV-1081)', () => {
  // Brampton 1, 2026-06-29 feed: the Downtown Terminal short-turn (27, no period value) beat Queen East (29).
  const shortTurn = { headway: 27, headwayByPeriod: NONE };
  const main = { headway: 29, headwayByPeriod: { ...NONE, amPeak: 25, midday: 29, pmPeak: 31 } };

  it('prefers a pattern with period values over a lower headline with none, in either order', () => {
    expect(historyHeadlineWins(main, shortTurn)).toBe(true);
    expect(historyHeadlineWins(shortTurn, main)).toBe(false);
  });

  it('keeps the smallest headway between two patterns that both have, or both lack, period values', () => {
    expect(historyHeadlineWins({ ...main, headway: 20 }, main)).toBe(true);
    expect(historyHeadlineWins({ ...main, headway: 29 }, main)).toBe(false);
    expect(historyHeadlineWins({ headway: 20, headwayByPeriod: NONE }, shortTurn)).toBe(true);
    expect(historyHeadlineWins({ headway: 20 }, shortTurn)).toBe(true);
  });

  it('takes the first pattern for a route', () => {
    expect(historyHeadlineWins(shortTurn, undefined)).toBe(true);
  });
});
