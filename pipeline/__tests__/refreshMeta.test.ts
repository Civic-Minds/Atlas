import { describe, expect, it } from 'vitest';
import { shouldStampFeedMeta, stampFeedMeta } from '../refreshMeta.js';

describe('shouldStampFeedMeta', () => {
  it('stamps only when featureCount > 0', () => {
    expect(shouldStampFeedMeta(0)).toBe(false);
    expect(shouldStampFeedMeta(1)).toBe(true);
    expect(shouldStampFeedMeta(42)).toBe(true);
  });
});

describe('stampFeedMeta', () => {
  it('writes expiry, version, and refreshed-at', () => {
    const agency: {
      lastFeedExpiry?: string | null;
      lastFeedVersion?: string | null;
      lastRefreshedAt?: string | null;
    } = {
      lastFeedExpiry: 'old',
      lastFeedVersion: 'v0',
      lastRefreshedAt: '2020-01-01',
    };
    stampFeedMeta(agency, {
      feedExpiry: '20251231',
      feedVersion: 'v2',
      peekedExpiry: 'peeked',
      peekedVersion: 'peeked-v',
      todayYmd: '2026-07-19',
    });
    expect(agency.lastFeedExpiry).toBe('20251231');
    expect(agency.lastFeedVersion).toBe('v2');
    expect(agency.lastRefreshedAt).toBe('2026-07-19');
  });

  it('falls back to peeked values when process did not return feed_info', () => {
    const agency: {
      lastFeedExpiry?: string | null;
      lastFeedVersion?: string | null;
      lastRefreshedAt?: string | null;
    } = {};
    stampFeedMeta(agency, {
      feedExpiry: null,
      feedVersion: null,
      peekedExpiry: '20250101',
      peekedVersion: 'peek',
      todayYmd: '2026-07-19',
    });
    expect(agency.lastFeedExpiry).toBe('20250101');
    expect(agency.lastFeedVersion).toBe('peek');
  });
});
