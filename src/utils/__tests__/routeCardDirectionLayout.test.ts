import { describe, expect, it } from 'vitest';
import { shouldShowDirectionSections } from '../routeCardDirectionLayout';

describe('shouldShowDirectionSections', () => {
  it('hides section chrome for two groups with one destination each', () => {
    expect(shouldShowDirectionSections([
      { realTier: [{}] },
      { realTier: [{}] },
    ])).toBe(false);
  });

  it('shows section chrome when a direction has multiple branches', () => {
    expect(shouldShowDirectionSections([
      { realTier: [{}, {}] },
      { realTier: [{}] },
    ])).toBe(true);
  });

  it('hides section chrome for a single direction group', () => {
    expect(shouldShowDirectionSections([{ realTier: [{}, {}] }])).toBe(false);
  });
});
