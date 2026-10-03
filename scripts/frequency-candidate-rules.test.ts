import { describe, expect, it } from 'vitest';
import { determineCandidateTier } from './frequency-candidate-rules';

const base = {
  edgeMode: 'none' as const,
  edgeLimit: 'grace' as const,
  internal: { name: 'fixed-2', percent: 0, minimum: 2, maximum: 2 },
  hardGap: 'current' as const,
};

describe('frequency candidate rules', () => {
  it('matches the current rule for a route with two 15-minute gaps in otherwise 10-minute service', () => {
    const times = [0, 10, 25, 35, 45, 55, 65, 80, 90, 100, 110];
    expect(determineCandidateTier(times, [10], { ...base, internal: { name: 'current', percent: 0.30, minimum: 2 } }).tier).toBe('10');
  });

  it('rejects a third near miss under a fixed two-gap cap', () => {
    const times = [0, 10, 25, 35, 50, 60, 75, 85, 100, 110, 125];
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

  it('does not qualify a two-trip period by trimming its only edge gap', () => {
    const result = determineCandidateTier([0, 20], [10, 15, 20, 30], {
      ...base,
      edgeMode: 'opening',
      edgeLimit: 'double',
    });
    expect(result.tier).toBe('15');
    expect(result.edgeWarnings).toEqual([]);
  });
});
