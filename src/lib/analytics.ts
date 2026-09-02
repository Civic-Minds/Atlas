const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function initAnalytics() {
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

export function trackPageView(path: string) {
  if (!initialized) return;
  window.gtag('event', 'page_view', { page_path: path });
}

export function trackEvent(name: string, parameters: Record<string, string | number | boolean | undefined> = {}) {
  if (!initialized) return;
  window.gtag('event', name, parameters);
}
