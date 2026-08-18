import { describe, expect, it } from 'vitest';
import { assessFeedQuality } from '../feedQuality';

const healthy = {
  validationErrors: 0,
  validationWarnings: 0,
  shapeAnomalies: 0,
  routeHeadwayMismatches: 0,
  featureCount: 10,
  checkedAt: '2026-08-14',
};

describe('assessFeedQuality', () => {
  it('keeps a usable feed with a metric warning in review', () => {
    const result = assessFeedQuality({ ...healthy, routeHeadwayMismatches: 1 });
    expect(result.status).toBe('review');
    expect(result.score).toBe(90);
  });

  it('does not call a feed unusable because it needs review', () => {
    const result = assessFeedQuality({ ...healthy, shapeAnomalies: 1, validationWarnings: 1 });
    expect(result.status).toBe('review');
    expect(result.reasons).toHaveLength(2);
  });

  it('marks expired feeds degraded', () => {
    const result = assessFeedQuality({ ...healthy, feedExpiry: '20260813' });
    expect(result.status).toBe('degraded');
    expect(result.reasons).toContain('The feed schedule has expired.');
  });

  it('marks feeds with no route output unusable', () => {
    const result = assessFeedQuality({ ...healthy, featureCount: 0 });
    expect(result.status).toBe('unusable');
    expect(result.score).toBe(0);
  });
});
