import { describe, expect, it } from 'vitest';
import { hasDuplicateDirectionHeadsigns, shouldShowDirectionSections } from '../routeCardDirectionLayout';

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

describe('hasDuplicateDirectionHeadsigns', () => {
  it('detects one GTFS destination repeated across directions', () => {
    expect(hasDuplicateDirectionHeadsigns([
      { realTier: [{ headsign: 'SMU EXPRESS' }] },
      { realTier: [{ headsign: 'SMU EXPRESS' }] },
    ])).toBe(true);
  });

  it('allows distinct destinations in opposite directions', () => {
    expect(hasDuplicateDirectionHeadsigns([
      { realTier: [{ headsign: 'SMU EXPRESS' }] },
      { realTier: [{ headsign: 'DAMESBURY' }] },
    ])).toBe(false);
  });
});
