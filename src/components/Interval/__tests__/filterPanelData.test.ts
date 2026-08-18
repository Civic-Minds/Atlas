import { describe, expect, it } from 'vitest';
import { getHiddenFeedAgencies } from '../FilterPanel';
import type { Agency } from '../../../App';

const agency = (slug: string, name: string, status?: 'healthy' | 'review' | 'degraded' | 'unusable'): Agency => ({
  slug,
  name,
  center: [0, 0],
  url: '',
  feedQuality: status ? {
    status,
    score: status === 'healthy' ? 100 : 40,
    reasons: status === 'unusable' ? ['The feed has validation errors.'] : ['The feed schedule has expired.'],
    metrics: { validationErrors: 0, validationWarnings: 0, shapeAnomalies: 0, routeHeadwayMismatches: 0, featureCount: 1 },
    checkedAt: '2026-08-18',
  } : undefined,
});

describe('getHiddenFeedAgencies', () => {
  it('returns degraded and unusable feeds in name order', () => {
    expect(getHiddenFeedAgencies([
      agency('z', 'Zeta', 'degraded'),
      agency('a', 'Alpha', 'unusable'),
      agency('r', 'Review only', 'review'),
      agency('h', 'Healthy', 'healthy'),
    ]).map(item => item.slug)).toEqual(['a', 'z']);
  });

  it('returns an empty list when no feeds would be hidden', () => {
    expect(getHiddenFeedAgencies([
      agency('r', 'Review only', 'review'),
      agency('h', 'Healthy', 'healthy'),
      agency('n', 'No quality record'),
    ])).toEqual([]);
  });
});
