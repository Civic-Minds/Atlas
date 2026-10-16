import { LIVE_ANALYSIS_ROUTES } from './livePollingConfig';
import { LIVE_DASHBOARD_HOLD } from './liveDashboard';

/**
 * The exact addresses of the published Live report pages: each agency page and each route page live:publish writes
 * (analysed routes and held ones), with and without a trailing slash. vercel.json rewrites exactly these to the app,
 * never a pattern, so any other /apps/live/... address still gets a real 404 (shared/seoFiles.test.ts).
 */
export function liveReportPaths(): string[] {
  const keys = [...new Set([...LIVE_ANALYSIS_ROUTES, ...Object.keys(LIVE_DASHBOARD_HOLD)])];
  const agencies = [...new Set(keys.map(k => k.split('::')[0]))];
  const pages = [...agencies.map(a => `/apps/live/${a}`), ...keys.map(k => { const [a, r] = k.split('::'); return `/apps/live/${a}/${r}`; })];
  return pages.flatMap(p => [p, `${p}/`]);
}
