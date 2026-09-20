import { describe, expect, it } from 'vitest';
import { isAgencyVisibleInBrowser } from '../agencyVisibility.js';

const production = { development: false, betaEnabled: false };

describe('isAgencyVisibleInBrowser', () => {
  it('hides staged agencies in every environment', () => {
    expect(isAgencyVisibleInBrowser({ staged: true }, { development: true, betaEnabled: true })).toBe(false);
  });

  it('shows ordinary agencies in production', () => {
    expect(isAgencyVisibleInBrowser({}, production)).toBe(true);
  });

  it('shows hidden agencies only in development or beta when marked beta-only', () => {
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true }, { development: true, betaEnabled: false })).toBe(true);
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true, betaOnly: true }, { development: false, betaEnabled: true })).toBe(true);
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true, betaOnly: true }, production)).toBe(false);
    expect(isAgencyVisibleInBrowser({ hiddenInProduction: true }, { development: false, betaEnabled: true })).toBe(false);
  });
});
