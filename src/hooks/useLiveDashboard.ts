import { useEffect, useState } from 'react';
import type { LiveDashboardResponse } from '../../shared/liveDashboard';
import { devOnly } from '../lib/liveReportData';
import { fetchLiveDashboard } from '../lib/liveDashboardFetch';

export type LiveDashboardState =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string }
  | { kind: 'done'; data: LiveDashboardResponse };

/** The Live route dashboard's data and whether it exists (/api/live-dashboard in dev, the published JSON on R2 in builds). Shared by the full page and the route card, so their numbers cannot differ. */
export function useLiveDashboard(agency: string | null | undefined, route: string | null | undefined): LiveDashboardState {
  const [state, setState] = useState<LiveDashboardState>({ kind: 'loading' });
  useEffect(() => {
    if (!agency || !route) return;
    let live = true;
    setState({ kind: 'loading' });
    fetchLiveDashboard(agency, route)
      .then(data => { if (live) setState({ kind: 'done', data }); })
      .catch(() => { if (live) setState({ kind: 'error', reason: devOnly('The Live API did not answer. Start Live with "npm run live" and open this page on the address it prints.') }); });
    return () => { live = false; };
  }, [agency, route]);
  return state;
}

/** The agency's Live page: where a route page's "← TTC" goes (CIV-1446). */
export const liveAgencyPath = (agency: string) => `/apps/live/${encodeURIComponent(agency)}`;

/** The page's URL for a route's full analysis. */
export const liveDashboardPath = (agency: string, route: string) => `/apps/live/${encodeURIComponent(agency)}/${encodeURIComponent(route)}`;

/** The Live planner's URL, with a route picked when given (#1153): where "View on Live map" goes. */
export const liveToolPath = (agency: string, route?: string | null) =>
  `/apps/live/${encodeURIComponent(agency)}/tool${route ? `?route=${encodeURIComponent(route)}` : ''}`;
