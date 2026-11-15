import { describe, expect, it } from 'vitest';
import { MISSING_VALUE } from '../missingValue';
import { headwayAmount, headwayEvery } from '../headwayText';

// CIV-1569 part 4: one mark for a missing value, the em dash the frequency text already used.
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('missing value (CIV-1569)', () => {
  it('is the em dash, the same mark a missing frequency prints', () => {
    expect(MISSING_VALUE).toBe('—');
    expect(headwayEvery(null)).toBe(MISSING_VALUE);
    expect(headwayAmount(undefined)).toBe(MISSING_VALUE);
  });
});
