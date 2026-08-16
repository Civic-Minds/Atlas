import { describe, expect, it } from 'vitest';
import { isFeedExpired } from '../feedFreshness';

describe('isFeedExpired', () => {
  const now = new Date('2026-08-09T12:00:00Z');

  it('identifies a feed that ended before today', () => {
    expect(isFeedExpired('20240518', now)).toBe(true);
  });

  it('keeps a feed active through its expiry date', () => {
    expect(isFeedExpired('20260809', now)).toBe(false);
    expect(isFeedExpired('20261017', now)).toBe(false);
  });

  it('ignores missing and malformed dates', () => {
    expect(isFeedExpired(null, now)).toBe(false);
    expect(isFeedExpired('not-a-date', now)).toBe(false);
  });
});
