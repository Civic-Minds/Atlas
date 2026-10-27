import { describe, expect, it, vi } from 'vitest';
import { agencyTodayYmd, effectiveFeedExpiry, isAgencyFeedExpired, isActiveProductionFeed, isStalePrimaryProductionFeed, isCurrentFeedExpiry, isExpiredFeedExpiry, isCurrentProductionFeed, isStaleProductionFeed } from '../feedAvailability.js';

describe('isCurrentFeedExpiry', () => {
  it('accepts service through today or later', () => {
    expect(isCurrentFeedExpiry('20260810', '20260810')).toBe(true);
    expect(isCurrentFeedExpiry('20260811', '20260810')).toBe(true);
  });

  it('rejects expired, missing, and malformed metadata', () => {
    expect(isCurrentFeedExpiry('20260809', '20260810')).toBe(false);
    expect(isCurrentFeedExpiry(null, '20260810')).toBe(false);
    expect(isCurrentFeedExpiry('unknown', '20260810')).toBe(false);
  });
});

describe('isExpiredFeedExpiry', () => {
  it('is true only for a dated expiry before today', () => {
    expect(isExpiredFeedExpiry('20260809', '20260810')).toBe(true);
    expect(isExpiredFeedExpiry('20260810', '20260810')).toBe(false);
    expect(isExpiredFeedExpiry(null, '20260810')).toBe(false);
    expect(isExpiredFeedExpiry('', '20260810')).toBe(false);
  });
});

describe('isCurrentProductionFeed', () => {
  it('excludes staged and hidden agencies even with current dates', () => {
    expect(isCurrentProductionFeed({ lastFeedExpiry: '20260810', staged: true }, '20260810')).toBe(false);
    expect(isCurrentProductionFeed({ lastFeedExpiry: '20260810', hiddenInProduction: true }, '20260810')).toBe(false);
    expect(isCurrentProductionFeed({ lastFeedExpiry: '20260810' }, '20260810')).toBe(true);
  });
});

describe('active and stale production feeds', () => {
  it('keeps a published expired snapshot active', () => {
    const agency = { lastFeedExpiry: '20260809', lastRefreshedAt: '20260801' };
    expect(isActiveProductionFeed(agency, '20260810')).toBe(true);
    expect(isCurrentProductionFeed(agency, '20260810')).toBe(false);
    expect(isStaleProductionFeed(agency, '20260810')).toBe(true);
  });

  it('does not call a published feed with an open-ended or undated calendar stale', () => {
    for (const lastFeedExpiry of [null, '']) {
      const agency = { lastFeedExpiry, lastRefreshedAt: '20260801' };
      expect(isActiveProductionFeed(agency, '20260810')).toBe(true);
      expect(isStaleProductionFeed(agency, '20260810')).toBe(false);
      expect(isCurrentProductionFeed(agency, '20260810')).toBe(true);
    }
  });
});

describe('effectiveFeedExpiry', () => {
  it('uses the earliest dated expiry across the main and supplemental feeds', () => {
    const rail = { feedExpiry: '20261021', feedVersion: null, rawArchiveKey: null };
    expect(effectiveFeedExpiry({ lastFeedExpiry: '20261212', lastSupplementalFeeds: [rail] })).toBe('20261021');
    expect(effectiveFeedExpiry({ lastFeedExpiry: '20261001', lastSupplementalFeeds: [rail] })).toBe('20261001');
    expect(effectiveFeedExpiry({ lastFeedExpiry: '20261212' })).toBe('20261212');
  });

  it('ignores undated supplementals and keeps a missing main expiry missing when nothing is dated', () => {
    const undated = { feedExpiry: null, feedVersion: 'v1', rawArchiveKey: null };
    expect(effectiveFeedExpiry({ lastFeedExpiry: '20261212', lastSupplementalFeeds: [undated] })).toBe('20261212');
    expect(effectiveFeedExpiry({ lastFeedExpiry: null, lastSupplementalFeeds: [undated] })).toBeNull();
  });
});

describe('isStalePrimaryProductionFeed', () => {
  it('does not make a current main feed a restore target because its supplemental expired', () => {
    const agency = {
      lastFeedExpiry: '20261212',
      lastRefreshedAt: '20261007',
      lastSupplementalFeeds: [{ feedExpiry: '20261021', feedVersion: null, rawArchiveKey: null }],
    };
    expect(isStaleProductionFeed(agency, '20261022')).toBe(true);
    expect(isStalePrimaryProductionFeed(agency, '20261022')).toBe(false);
    expect(isStalePrimaryProductionFeed({ ...agency, lastFeedExpiry: '20261001' }, '20261022')).toBe(true);
  });
});

describe('feed expiry reads the agency\'s local date (Ryan, 2026-10-27)', () => {
  // 01:30 UTC on Aug 10 is still Aug 9 in Toronto and Los Angeles, and already Aug 10 in Berlin.
  const lateEvening = new Date('2026-08-10T01:30:00Z');

  it('keeps a feed running through its last local day', () => {
    expect(agencyTodayYmd({ timezone: 'America/Toronto' }, lateEvening)).toBe('20260809');
    expect(isAgencyFeedExpired({ timezone: 'America/Toronto', lastFeedExpiry: '20260809' }, lateEvening)).toBe(false);
    expect(isAgencyFeedExpired({ timezone: 'America/Los_Angeles', lastFeedExpiry: '20260809' }, lateEvening)).toBe(false);
  });

  it('ends it once the local day is over', () => {
    expect(isAgencyFeedExpired({ timezone: 'Europe/Berlin', lastFeedExpiry: '20260809' }, lateEvening)).toBe(true);
    expect(isAgencyFeedExpired({ timezone: 'America/Toronto', lastFeedExpiry: '20240518' }, lateEvening)).toBe(true);
  });

  it('with no time zone on file, waits for the last place on Earth to reach midnight', () => {
    expect(isAgencyFeedExpired({ lastFeedExpiry: '20260809' }, new Date('2026-08-10T11:30:00Z'))).toBe(false);
    expect(isAgencyFeedExpired({ lastFeedExpiry: '20260809' }, new Date('2026-08-10T12:30:00Z'))).toBe(true);
  });

  it('reads the earliest feed, and ignores missing and malformed dates', () => {
    const now = new Date('2026-08-09T12:00:00Z');
    expect(isAgencyFeedExpired({ timezone: 'America/Toronto', lastFeedExpiry: '20261017', lastSupplementalFeeds: [{ feedExpiry: '20260801', feedVersion: null, rawArchiveKey: null }] }, now)).toBe(true);
    expect(isAgencyFeedExpired({ timezone: 'America/Toronto', lastFeedExpiry: null }, now)).toBe(false);
    expect(isAgencyFeedExpired({ timezone: 'America/Toronto', lastFeedExpiry: 'not-a-date' }, now)).toBe(false);
  });

  it('is the default "today" of the production feed checks', () => {
    const agency = { timezone: 'America/Toronto', lastFeedExpiry: '20260809', lastRefreshedAt: '20260801' };
    vi.useFakeTimers({ toFake: ['Date'], now: lateEvening });
    try {
      expect(isStaleProductionFeed(agency)).toBe(false);
      expect(isStaleProductionFeed({ ...agency, timezone: 'Europe/Berlin' })).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
