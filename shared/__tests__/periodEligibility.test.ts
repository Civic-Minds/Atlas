import { describe, expect, it } from 'vitest';
import { hasAnyPeriodCoverage, hasPeriodCoverageValue, isUnsustainedWithoutCoverage, periodCoverageValue } from '../periodEligibility';

describe('period eligibility policy', () => {
  it('uses the worst-direction coverage value when available', () => {
    const fields = {
      periodCoverageHeadway: { overnight: 180 },
      worstDirectionPeriodCoverageHeadway: { overnight: 210 },
    };
    expect(periodCoverageValue(fields, 'overnight')).toBe(210);
    expect(hasPeriodCoverageValue(fields, 'overnight')).toBe(true);
    expect(hasAnyPeriodCoverage(fields)).toBe(true);
  });

  it('treats an unsustained median without coverage as unqualified', () => {
    const fields = {
      headwayByPeriodSustained: { overnight: false },
    };
    expect(isUnsustainedWithoutCoverage(fields, 'overnight')).toBe(true);
  });

  it('does not use a span route max gap as regular coverage', () => {
    const fields = { tier: 'span', maxGapByPeriod: { overnight: 180 } };
    expect(periodCoverageValue(fields, 'overnight')).toBeUndefined();
    expect(hasAnyPeriodCoverage(fields)).toBe(false);
  });
});
