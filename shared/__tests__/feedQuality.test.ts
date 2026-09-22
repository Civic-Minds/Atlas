import { describe, expect, it } from 'vitest';
import { assessFeedQuality, presentFeedQualityReason } from '../feedQuality';

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
    expect(result.reasons).toContain('The schedule dates in this feed have passed.');
  });

  it('marks feeds with no route output unusable', () => {
    const result = assessFeedQuality({ ...healthy, featureCount: 0 });
    expect(result.status).toBe('unusable');
    expect(result.score).toBe(0);
  });
});

describe('presentFeedQualityReason', () => {
  it('normalizes older persisted route-shape wording', () => {
    expect(presentFeedQualityReason('369 map lines were repaired — Atlas fixed unusual route geometry before displaying it.'))
      .toBe('369 route shapes needed adjustment before display.');
  });

  it('normalizes older persisted frequency wording', () => {
    expect(presentFeedQualityReason("1 route frequency needs checking — some stops appear to have more frequent service than the route's overall schedule suggests."))
      .toBe('1 route has stops whose frequency differs from the overall route schedule.');
  });
});
