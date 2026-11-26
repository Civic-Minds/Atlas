import { describe, expect, it } from 'vitest';
import { PERIOD_COVERAGE_MAX_HEADWAY, periodFilterValue } from '../periodEligibility';

// CIV-2976 F4/F5: the one "steady within the cap reads its spacing, else its wait" rule.
describe('periodFilterValue', () => {
  it('reads the spacing for a steady period whose wait is within the cap', () => {
    expect(periodFilterValue({ headway: 10, coverage: 25, steady: true })).toBe(10);
    expect(periodFilterValue({ headway: 10, coverage: PERIOD_COVERAGE_MAX_HEADWAY, steady: true })).toBe(10);
  });

  it('reads the wait when the period is not steady or the wait is over the cap', () => {
    expect(periodFilterValue({ headway: 10, coverage: 25, steady: false })).toBe(25);
    expect(periodFilterValue({ headway: 10, coverage: PERIOD_COVERAGE_MAX_HEADWAY + 1, steady: true })).toBe(PERIOD_COVERAGE_MAX_HEADWAY + 1);
  });

  it('tests the cap on capWait when given (CIV-1958 clock-minute wait)', () => {
    expect(periodFilterValue({ headway: 10, coverage: 61, steady: true, capWait: 60 })).toBe(10);
    expect(periodFilterValue({ headway: 10, coverage: 60, steady: true, capWait: 61 })).toBe(60);
    expect(periodFilterValue({ headway: 10, coverage: 30, steady: true, capWait: null })).toBe(30);
  });

  it('passes a missing wait through', () => {
    expect(periodFilterValue({ headway: 10, coverage: null, steady: true })).toBeNull();
    expect(periodFilterValue({ headway: 10, coverage: undefined, steady: true })).toBeUndefined();
  });
});
