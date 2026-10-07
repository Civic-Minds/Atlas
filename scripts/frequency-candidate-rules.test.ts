import { describe, expect, it } from 'vitest';
import { determineCandidateTier } from './frequency-candidate-rules';

const base = {
  edgeMode: 'none' as const,
  edgeLimit: 'grace' as const,
  internal: { name: 'fixed-2', percent: 0, minimum: 2, maximum: 2 },
  hardGap: 'current' as const,
};

describe('frequency candidate rules', () => {
  it('can require every internal gap to meet the tier or its hard limit', () => {
    const times = [0, 10, 25, 35, 45, 55, 65, 80, 90, 100, 110];
    expect(determineCandidateTier(times, [10], {
      ...base,
      internal: { name: 'fixed-0', percent: 0, minimum: 0, maximum: 0 },
    }).tier).toBe('span');
  });

  it('matches the current rule for a route with two 15-minute gaps in otherwise 10-minute service', () => {
    const times = [0, 10, 25, 35, 45, 55, 65, 80, 90, 100, 110];
    expect(determineCandidateTier(times, [10], { ...base, internal: { name: 'current', percent: 0.30, minimum: 2 } }).tier).toBe('10');
  });

  it('rejects a third near miss under a fixed two-gap cap', () => {
    const times = [0, 10, 25, 35, 50, 60, 75, 85, 95, 105, 115];
    expect(determineCandidateTier(times, [10], base).tier).toBe('span');
  });

  it('can treat a longer opening gap as an edge warning without changing sustained cadence', () => {
    const times = [0, 20, 30, 40, 50, 60, 70, 80];
    const result = determineCandidateTier(times, [10], {
      ...base,
      edgeMode: 'opening',
      edgeLimit: 'double',
    });
    expect(result.tier).toBe('10');
    expect(result.edgeWarnings).toEqual(['opening']);
  });

  it('keeps very large gaps as hard failures under the current policy', () => {
    const times = [0, 10, 20, 60, 70, 80];
    expect(determineCandidateTier(times, [10], base).tier).toBe('span');
  });

  it('supports explicit proportional hard-gap thresholds', () => {
    const times = [0, 10, 20, 35, 45, 55];
    expect(determineCandidateTier(times, [10], { ...base, hardGap: 'one-and-a-quarter' }).tier).toBe('span');
    expect(determineCandidateTier(times, [10], { ...base, hardGap: 'one-and-a-half' }).tier).toBe('10');
  });

  it('does not qualify a two-trip period by trimming its only edge gap', () => {
    const result = determineCandidateTier([0, 20], [10, 15, 20, 30], {
      ...base,
      edgeMode: 'opening',
      edgeLimit: 'double',
    });
    expect(result.tier).toBe('15');
    expect(result.edgeWarnings).toEqual([]);
  });

  it('uses three departures as the default minimum evidence', () => {
    expect(determineCandidateTier([0, 10], [10], { ...base, minimumEvidence: 3 }).tier).toBe('span');
    expect(determineCandidateTier([0, 10, 20], [10], base).tier).toBe('10');
  });

  it('supports a higher minimum-evidence candidate', () => {
    expect(determineCandidateTier([0, 10, 20], [10], { ...base, minimumEvidence: 4 }).tier).toBe('span');
  });

  it('uses a tier-specific internal near-miss percentage', () => {
    const times = [0, 10, 25, 35, 45, 55, 65, 75, 85, 95, 105];
    const result = determineCandidateTier(times, [10], {
      ...base,
      internal: {
        name: 'tier-specific',
        percent: 0,
        percentByTier: { 10: 0.2 },
        minimum: 0,
      },
    });
    expect(result.tier).toBe('10');
  });

  it('can give a short period one percentage allowance through a minimum floor', () => {
    const times = [0, 15, 25];
    expect(determineCandidateTier(times, [10], {
      ...base,
      internal: { name: 'no-floor', percent: 0, minimum: 0 },
    }).tier).toBe('span');
    expect(determineCandidateTier(times, [10], {
      ...base,
      internal: { name: 'one-floor', percent: 0, minimum: 1 },
    }).tier).toBe('10');
  });

  it('caps a percentage allowance even when the percentage would allow more gaps', () => {
    const times = [0, 35, 65, 100, 130, 165, 195, 230, 260, 290];
    expect(determineCandidateTier(times, [30], {
      ...base,
      internal: { name: 'capped', percent: 0.5, minimum: 0, maximum: 3 },
    }).tier).toBe('span');
  });
});
