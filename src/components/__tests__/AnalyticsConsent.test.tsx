import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const privacyRegionCountry = vi.fn(() => Promise.resolve('DE'));
vi.mock('../../lib/privacyRegion', () => ({ privacyRegionCountry: () => privacyRegionCountry() }));

describe('AnalyticsConsent on localhost (CIV-1335)', () => {
  afterEach(() => { privacyRegionCountry.mockClear(); });

  it('never shows the permission prompt or looks up the region', async () => {
    // jsdom serves tests from localhost by default.
    expect(window.location.hostname).toBe('localhost');
    const { default: AnalyticsConsent } = await import('../AnalyticsConsent');
    render(<AnalyticsConsent />);
    await Promise.resolve();
    expect(screen.queryByRole('dialog', { name: 'Analytics consent' })).toBeNull();
    expect(privacyRegionCountry).not.toHaveBeenCalled();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});
