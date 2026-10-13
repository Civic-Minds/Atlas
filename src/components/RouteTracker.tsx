import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { trackLandingPageView, trackPageView } from '../lib/analytics';

/** Sends one GA page view per route change for every page, including /about, /privacy and /terms. */
export default function RouteTracker() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      trackLandingPageView(pathname);
      return;
    }
    trackPageView(pathname);
  }, [pathname]);
  return null;
}
