import { ATLAS_MODE, FEATURES } from '../../shared/config';
import { isInternalTestSession } from './internalTest';

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const CONSENT_KEY = 'atlas.analytics-consent';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false;
let analyticsDisabled = false;
let pendingEvents: Array<{ name: string; parameters: Record<string, unknown> }> = [];

export type AnalyticsConsent = 'granted' | 'denied';

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : null;
}

function loadAnalytics() {
  if (initialized || isInternalTestSession() || !import.meta.env.PROD || !measurementId || typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(..._args: unknown[]) {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // page_location: Google reads the address bar by default, lat and lon included (#1519).
  window.gtag('config', measurementId, { send_page_view: false, page_location: pageLocation() });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  initialized = true;

  for (const event of pendingEvents) {
    window.gtag('event', event.name, event.parameters);
  }
  pendingEvents = [];
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, consent);
  if (consent === 'granted') {
    analyticsDisabled = false;
    loadAnalytics();
  }
  if (consent === 'denied') {
    analyticsDisabled = true;
    pendingEvents = [];
    if (initialized) window.gtag('consent', 'update', { analytics_storage: 'denied' });
  }
}

export function initAnalytics() {
  if (isInternalTestSession() || getAnalyticsConsent() === 'denied') {
    analyticsDisabled = true;
    pendingEvents = [];
    return;
  }
  loadAnalytics();
}

/**
 * #1519: an address with the map view's lat and lon left out. After "locate me" the view is the
 * visitor's own position, so page analytics (Google's page_location, Vercel's url) and the feedback
 * email get the address without them. The zoom and everything else stay.
 */
export function withoutMapPosition(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete('lat');
    u.searchParams.delete('lon');
    return u.toString();
  } catch {
    return href;
  }
}

const pageLocation = () => (typeof window === 'undefined' ? undefined : withoutMapPosition(window.location.href));

export function trackPageView(path: string) {
  trackEvent('page_view', { page_path: path });
}

export function trackEvent(name: string, parameters: Record<string, string | number | boolean | undefined> = {}) {
  if (analyticsDisabled || typeof window === 'undefined') return;
  const contextualParameters = { atlas_mode: ATLAS_MODE, page_location: pageLocation(), ...parameters };
  if (!initialized) {
    pendingEvents.push({ name, parameters: contextualParameters });
    return;
  }
  window.gtag('event', name, contextualParameters);
}

export const SHARE_UTM_SOURCE = 'atlas_share';
export const SHARE_UTM_MEDIUM_IMAGE = 'image';
export const SHARE_UTM_MEDIUM_LINK = 'link';
export type ShareMedium = typeof SHARE_UTM_MEDIUM_IMAGE | typeof SHARE_UTM_MEDIUM_LINK;

/**
 * The one place share links get their analytics tags, so shared visits can be counted (GA and
 * Vercel read utm_ params natively). Existing utm_source/utm_medium are replaced, never
 * duplicated, so re-sharing a tagged link stays clean. With `enabled` false (beta flag off) the
 * URL is returned untouched. Nothing reads these params back: URL-state parsers only look at their
 * own named params, so an arriving utm tag is ignored.
 */
export function withShareTags(url: string, medium?: ShareMedium, enabled: boolean = FEATURES.shareUtm): string {
  const u = new URL(url);
  // Always (on public too): a copied link must not carry the internal-session marker, which stays
  // in the address bar and would exclude whoever opens the link from analytics, nor old utm tags.
  u.searchParams.delete('atlas_internal');
  for (const key of Array.from(u.searchParams.keys())) {
    if (key.startsWith('utm_')) u.searchParams.delete(key);
  }
  if (enabled && medium) {
    u.searchParams.set('utm_source', SHARE_UTM_SOURCE);
    u.searchParams.set('utm_medium', medium);
  }
  return u.toString();
}

/** True when the URL carries any utm_ param. */
export function hasUtmParams(url: string): boolean {
  for (const key of new URL(url).searchParams.keys()) if (key.startsWith('utm_')) return true;
  return false;
}

/**
 * Send the first page view with the full landing URL (utm tags included, so GA can attribute the
 * visit), then drop the utm params from the address bar. The URL is captured into the event now,
 * so the strip is safe even though GA loads later and the event may still be queued.
 */
export function trackLandingPageView(path: string) {
  const landing = window.location.href;
  trackEvent('page_view', { page_path: path, page_location: withoutMapPosition(landing) });
  if (!hasUtmParams(landing)) return;
  const u = new URL(landing);
  for (const key of Array.from(u.searchParams.keys())) {
    if (key.startsWith('utm_')) u.searchParams.delete(key);
  }
  window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
}
