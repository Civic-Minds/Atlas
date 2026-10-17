import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAgencyTimezone } from '../agencyTimezone';

describe('resolveAgencyTimezone (CIV-251)', () => {
  it('keeps the config override over a feed that writes a cross-border zone', () => {
    // Spokane's feed says America/Vancouver: same offset, wrong country.
    expect(resolveAgencyTimezone('America/Vancouver', { timezone: 'America/Los_Angeles', timezoneOverride: 'America/Los_Angeles' })).toBe('America/Los_Angeles');
  });

  it('otherwise takes the feed zone, then the stored one', () => {
    expect(resolveAgencyTimezone('America/Chicago', { timezone: 'America/New_York' })).toBe('America/Chicago');
    expect(resolveAgencyTimezone(null, { timezone: 'America/New_York' })).toBe('America/New_York');
    expect(resolveAgencyTimezone(undefined, undefined)).toBeNull();
  });

  it('every configured override is a real zone and matches the stored timezone', () => {
    const dir = resolve(__dirname, '../../config/agencies');
    const overrides = readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'order.json')
      .map(f => JSON.parse(readFileSync(resolve(dir, f), 'utf8')))
      .filter(a => a.timezoneOverride != null);
    expect(overrides.map(a => a.slug).sort()).toEqual(['gold-coast', 'spokane', 'washington-county']);
    for (const a of overrides) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: a.timezoneOverride })).not.toThrow();
      expect(a.timezone).toBe(a.timezoneOverride);
    }
  });
});
