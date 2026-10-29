import { describe, expect, it } from 'vitest';
import { boardsAt, isThinPool, otherPatternDepartures } from '../stopEligibility.js';

// CIV-1011 #6: one rule for "is this stop time a departure a rider can take".
describe('boardsAt', () => {
  it('a drop-off-only stop time (pickup_type 1) does not board', () => {
    expect(boardsAt({ pickup_type: '1' })).toBe(false);
    expect(boardsAt({ pickup_type: ' 1 ' })).toBe(false);
  });

  it('regular, phone-ahead and coordinate-with-driver pickups board, as does a missing value', () => {
    for (const pickup_type of ['0', '2', '3', '', undefined, null]) expect(boardsAt({ pickup_type })).toBe(true);
  });
});

describe('a thin pool (CIV-1071)', () => {
  it('counts only the departures the other patterns add, repeated times one for one', () => {
    // Own 08:00 twice and 08:20; the pool adds 08:00 (a third copy), 08:10 and 09:30 (outside the window).
    const own = [480, 480, 500];
    const merged = [480, 480, 480, 490, 500, 570];
    expect(otherPatternDepartures(merged, own, 480, 540)).toBe(2);
    expect(isThinPool(merged, own, 480, 540)).toBe(true);
    expect(isThinPool([...merged, 495, 505], own, 480, 540)).toBe(false);
  });
});
