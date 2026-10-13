import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { trackPageView } from '../lib/analytics';

/** Sends one GA page view per route change for every page, including /about, /privacy and /terms. */
export default function RouteTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  return null;
}
