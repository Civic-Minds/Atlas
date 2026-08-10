import { describe, expect, it } from 'vitest';
import { isCurrentFeedExpiry, isCurrentProductionFeed } from '../feedAvailability.js';

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
