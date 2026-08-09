import { describe, expect, it } from 'vitest';
import { decideRefreshSkipUnchanged, shouldStampFeedMeta, stampFeedMeta } from '../refreshMeta.js';

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

describe('decideRefreshSkipUnchanged', () => {
  const base = {
    forceRefresh: false,
    hasSupplementals: false,
    feedExpired: false,
  };

  it('reprocesses when feed_version changes under the same end date (MBTA)', () => {
    const d = decideRefreshSkipUnchanged({
      ...base,
      peekedExpiry: '20260905',
      peekedVersion: 'Summer 2026, 2026-08-07T15:32:18+00:00, version D',
      lastFeedExpiry: '20260905',
      lastFeedVersion: 'Summer 2026, 2026-06-26T19:57:52+00:00, version D',
    });
    expect(d.skip).toBe(false);
  });

  it('skips when both end date and version match', () => {
    const d = decideRefreshSkipUnchanged({
      ...base,
      peekedExpiry: '20270131',
      peekedVersion: 'UTC: 10-Jun-2026 22:25',
      lastFeedExpiry: '20270131',
      lastFeedVersion: 'UTC: 10-Jun-2026 22:25',
    });
    expect(d).toEqual({ skip: true, reason: 'skipped (same schedule period: 20270131)' });
  });

  it('skips on matching end date when version is missing on either side', () => {
    const d = decideRefreshSkipUnchanged({
      ...base,
      peekedExpiry: '20261201',
      peekedVersion: null,
      lastFeedExpiry: '20261201',
      lastFeedVersion: 'UTC: 21-May-2026 20:09',
    });
    expect(d.skip).toBe(true);
  });

  it('reprocesses expired feeds even when metadata matches', () => {
    const d = decideRefreshSkipUnchanged({
      ...base,
      feedExpired: true,
      peekedExpiry: '20260801',
      peekedVersion: 'v202606282',
      lastFeedExpiry: '20260801',
      lastFeedVersion: 'v202606282',
    });
    expect(d.skip).toBe(false);
  });

  it('skips version-only agencies when version is unchanged', () => {
    const d = decideRefreshSkipUnchanged({
      ...base,
      peekedExpiry: null,
      peekedVersion: '7/30/2026',
      lastFeedExpiry: null,
      lastFeedVersion: '7/30/2026',
    });
    expect(d).toEqual({ skip: true, reason: 'skipped (same feed version: 7/30/2026)' });
  });

  it('never skips under --force', () => {
    const d = decideRefreshSkipUnchanged({
      ...base,
      forceRefresh: true,
      peekedExpiry: '20270131',
      peekedVersion: 'same',
      lastFeedExpiry: '20270131',
      lastFeedVersion: 'same',
    });
    expect(d.skip).toBe(false);
  });
});
