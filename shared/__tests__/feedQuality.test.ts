import { describe, expect, it } from 'vitest';
import { assessFeedQuality, feedQualityListItems, presentFeedQualityReason } from '../feedQuality';

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

describe('feedQualityListItems', () => {
  it('shortens shape and frequency reasons, keeping singular and legacy wording', () => {
    expect(feedQualityListItems([
      '26 route shapes needed adjustment before display.',
      '2 route have stops whose frequency differs from the overall route schedule.',
    ])).toEqual(['26 shapes adjusted', '2 routes with frequency mismatches']);
    expect(feedQualityListItems([
      '1 map line was repaired — Atlas fixed unusual route geometry before displaying it.',
      "1 route frequency needs checking — some stops appear to have more frequent service than the route's overall schedule suggests.",
    ])).toEqual(['1 shape adjusted', '1 route with frequency mismatches']);
  });

  it('shows only the parts that apply and keeps other reasons in their existing wording without the closing full stop', () => {
    expect(feedQualityListItems([
      '3 minor schedule issues found while reading the feed.',
      '4 route shapes needed adjustment before display.',
    ])).toEqual(['4 shapes adjusted', '3 minor schedule issues found while reading the feed']);
    expect(feedQualityListItems(['The schedule dates in this feed have passed.'])).toEqual(['The schedule dates in this feed have passed']);
  });
});
