import { describe, expect, it } from 'vitest';
import { isActiveProductionFeed, isCurrentFeedExpiry, isCurrentProductionFeed, isStaleProductionFeed } from '../feedAvailability.js';

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

  it('treats a published feed with unknown expiry as stale', () => {
    const agency = { lastFeedExpiry: null, lastRefreshedAt: '20260801' };
    expect(isActiveProductionFeed(agency, '20260810')).toBe(true);
    expect(isStaleProductionFeed(agency, '20260810')).toBe(true);
  });
});
