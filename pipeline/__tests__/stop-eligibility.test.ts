import { describe, expect, it } from 'vitest';
import { boardsAt } from '../stopEligibility.js';

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
