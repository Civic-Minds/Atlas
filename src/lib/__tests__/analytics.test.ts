// Run on a deployed hostname; jsdom defaults to localhost, which analytics skips.
// @vitest-environment-options {"url": "https://transitatlas.fyi/"}
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../../shared/config';
import { parseAgencyUrlRule, parseModesParam } from '../../utils/shareUrlState';
import { trackLandingPageView, withShareTags } from '../analytics';

describe('analytics startup queue', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('VITE_ATLAS_MODE', 'public');
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

    expect(window.dataLayer.some((entry) => Array.from(entry as ArrayLike<unknown>).every((value, index) =>
      JSON.stringify(value) === JSON.stringify(['event', 'page_view', { atlas_mode: 'public', page_path: '/' }][index]),
    ))).toBe(true);
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

  it('does not initialize for an internal test session', async () => {
    window.history.replaceState({}, '', '/?atlas_internal=1');
    const { initAnalytics } = await import('../analytics');
    initAnalytics();

    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });
});

describe('withShareTags', () => {
  const base = 'https://atlas.example/?lat=43.65&lon=-79.38&z=11.00';

  it('tags with source and medium', () => {
    const u = new URL(withShareTags(base, 'link', true));
    expect(u.searchParams.get('utm_source')).toBe('atlas_share');
    expect(u.searchParams.get('utm_medium')).toBe('link');
    expect(u.searchParams.get('lat')).toBe('43.65');
  });

  it('replaces existing tags instead of duplicating them', () => {
    const tagged = withShareTags(base, 'link', true);
    const u = new URL(withShareTags(tagged, 'image', true));
    expect(u.searchParams.getAll('utm_source')).toEqual(['atlas_share']);
    expect(u.searchParams.getAll('utm_medium')).toEqual(['image']);
  });

  it('never adds atlas_internal', () => {
    expect(withShareTags(base, 'image', true)).not.toContain('atlas_internal');
    expect(withShareTags(`${base}&atlas_internal=1`, 'link', true)).not.toContain('atlas_internal');
  });

  it('returns the URL untouched when the flag is off', () => {
    expect(withShareTags(base, 'link', false)).toBe(base);
  });

  it('is off by default outside beta', () => {
    expect(withShareTags(base, 'link')).toBe(FEATURES.shareUtm ? withShareTags(base, 'link', true) : base);
  });

  it('utm params do not affect URL-state parsing', () => {
    const search = '?agencies=ttc.go&m=3&utm_source=atlas_share&utm_medium=link';
    const plain = '?agencies=ttc.go&m=3';
    expect(parseAgencyUrlRule(search)).toEqual(parseAgencyUrlRule(plain));
    expect(parseModesParam(search)).toEqual(parseModesParam(plain));
  });
});

describe('events stay off for internal sessions', () => {
  it('queues nothing and sends nothing for outbound_click', async () => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    window.history.replaceState({}, '', '/?atlas_internal=1');
    const { initAnalytics, trackEvent } = await import('../analytics');
    const gtag = vi.fn();
    window.gtag = gtag;
    initAnalytics();
    trackEvent('outbound_click', { kind: 'fares' });
    expect(gtag).not.toHaveBeenCalled();
  });
});

describe('link cleaning and landing strip', () => {
  const base = 'https://atlas.example/?lat=1&lon=2&atlas_internal=1&utm_source=x&utm_medium=y&utm_campaign=z';

  it('removes atlas_internal and utm tags even when tagging is off (public)', () => {
    const u = new URL(withShareTags(base, 'link', false));
    expect([...u.searchParams.keys()]).toEqual(['lat', 'lon']);
    expect([...new URL(withShareTags(base, undefined, true)).searchParams.keys()]).toEqual(['lat', 'lon']);
  });

  it('strips atlas_internal when tagging on too', () => {
    const u = new URL(withShareTags(base, 'image', true));
    expect(u.searchParams.has('atlas_internal')).toBe(false);
    expect(u.searchParams.get('utm_medium')).toBe('image');
    expect(u.searchParams.has('utm_campaign')).toBe(false);
  });

  it('sends the landing URL with utm in the first pageview, then strips the address bar', async () => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    vi.stubEnv('VITE_ATLAS_MODE', 'public');
    window.localStorage.clear();
    window.history.replaceState({}, '', '/?lat=1&utm_source=atlas_share&utm_medium=link&atlas_internal=0');
    const mod = await import('../analytics');
    window.dataLayer = [];
    mod.trackLandingPageView('/');
    expect(window.location.search).toBe('?lat=1&atlas_internal=0');
    mod.initAnalytics();
    const sent = JSON.stringify(window.dataLayer.map((e) => Array.from(e as ArrayLike<unknown>)));
    expect(sent).toContain('utm_source=atlas_share');
    expect(sent).toContain('page_location');
  });
});
