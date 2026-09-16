import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('analytics startup queue', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        clear: () => values.clear(),
      },
    });
    window.localStorage.clear();
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((script) => script.remove());
  });

  it('sends a page view queued before GA initializes', async () => {
    const { trackPageView, initAnalytics } = await import('../analytics');
    window.dataLayer = [];

    trackPageView('/');
    expect(window.dataLayer).toEqual([]);

    initAnalytics();

    expect(window.dataLayer).toContainEqual(['event', 'page_view', { page_path: '/' }]);
  });

  it('discards queued events when consent is denied', async () => {
    const { trackPageView, setAnalyticsConsent } = await import('../analytics');
    const gtag = vi.fn();
    window.gtag = gtag;

    trackPageView('/');
    setAnalyticsConsent('denied');

    expect(gtag).not.toHaveBeenCalled();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('does not initialize when stored consent is denied', async () => {
    window.localStorage.setItem('atlas.analytics-consent', 'denied');
    const { initAnalytics } = await import('../analytics');
    const gtag = vi.fn();
    window.gtag = gtag;

    initAnalytics();

    expect(gtag).not.toHaveBeenCalled();
    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});
