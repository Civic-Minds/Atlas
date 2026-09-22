import { describe, expect, it } from 'vitest';
import { isAgencyVisibleInBrowser } from '../agencyVisibility.js';

const production = { mode: 'public' as const };

describe('isAgencyVisibleInBrowser', () => {
  it('hides staged agencies in every environment', () => {
    expect(isAgencyVisibleInBrowser({ staged: true }, { mode: 'dev' })).toBe(false);
  });

  it('shows ordinary agencies in production', () => {
    expect(isAgencyVisibleInBrowser({}, production)).toBe(true);
  });

  it('shows hidden agencies only in dev or beta when marked beta-only', () => {
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true }, { mode: 'dev' })).toBe(true);
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true, betaOnly: true }, { mode: 'beta' })).toBe(true);
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true, betaOnly: true }, production)).toBe(false);
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true }, { mode: 'beta' })).toBe(false);
  });
});
