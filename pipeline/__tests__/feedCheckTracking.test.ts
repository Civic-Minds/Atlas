import { describe, expect, it } from 'vitest';
import { FEED_CHECK_TRACKING_START, recordFeedCheck } from '../feedCheckTracking.js';

describe('recordFeedCheck', () => {
  it('counts each completed inspection of the same expired feed', () => {
    const agency: Record<string, unknown> = {};
    recordFeedCheck(agency, { feedExpiry: '20250830', todayYmd: '20260622' });
    recordFeedCheck(agency, { feedExpiry: '20250830', todayYmd: '20260629' });

    expect(agency).toMatchObject({
      lastFeedCheckAt: '20260629',
      expiredFeedCheckCount: 2,
      expiredFeedCheckSince: FEED_CHECK_TRACKING_START,
      expiredFeedCheckExpiry: '20250830',
    });
  });

  it('starts a new counter when a new expired schedule appears', () => {
    const agency: Record<string, unknown> = {
      expiredFeedCheckCount: 4,
      expiredFeedCheckSince: FEED_CHECK_TRACKING_START,
      expiredFeedCheckExpiry: '20250830',
    };
    recordFeedCheck(agency, { feedExpiry: '20260830', todayYmd: '20260901' });

    expect(agency.expiredFeedCheckCount).toBe(1);
    expect(agency.expiredFeedCheckExpiry).toBe('20260830');
  });

  it('clears the expired counter for a current feed', () => {
    const agency: Record<string, unknown> = {
      expiredFeedCheckCount: 4,
      expiredFeedCheckSince: FEED_CHECK_TRACKING_START,
      expiredFeedCheckExpiry: '20250830',
    };
    recordFeedCheck(agency, { feedExpiry: '20270901', todayYmd: '20260823' });

    expect(agency.expiredFeedCheckCount).toBe(0);
    expect(agency.expiredFeedCheckExpiry).toBe('20270901');
  });
});
