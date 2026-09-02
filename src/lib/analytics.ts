const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
const CONSENT_KEY = 'atlas.analytics-consent';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false;

export type AnalyticsConsent = 'granted' | 'denied';

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : null;
}

function loadAnalytics() {
  if (initialized || !import.meta.env.PROD || !measurementId || typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
  initialized = true;
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CONSENT_KEY, consent);
  if (consent === 'granted') loadAnalytics();
  if (consent === 'denied' && initialized) window.gtag('consent', 'update', { analytics_storage: 'denied' });
}

export function initAnalytics() {
  if (getAnalyticsConsent() === 'denied') return;
  loadAnalytics();
}

export function trackPageView(path: string) {
  if (!initialized) return;
  window.gtag('event', 'page_view', { page_path: path });
}

export function trackEvent(name: string, parameters: Record<string, string | number | boolean | undefined> = {}) {
  if (!initialized) return;
  window.gtag('event', name, parameters);
}
