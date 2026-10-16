import { useEffect, useState } from 'react';
import type { LiveDashboardResponse } from '../../shared/liveDashboard';
import { devOnly, liveDashboardDataUrl, liveDataMissing } from '../lib/liveReportData';

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
    fetch(liveDashboardDataUrl(agency, route))
      .then(r => (liveDataMissing(r) ? { status: 'unknown_route', reason: `Live has no route ${route} for ${agency}.` } as LiveDashboardResponse : r.json() as Promise<LiveDashboardResponse>))
      .then(data => { if (live) setState({ kind: 'done', data }); })
      .catch(() => { if (live) setState({ kind: 'error', reason: devOnly('The Live API did not answer. Start Live with "npm run live" and open this page on the address it prints.') }); });
    return () => { live = false; };
  }, [agency, route]);
  return state;
}

/** The page's URL for a route's full analysis. */
export const liveDashboardPath = (agency: string, route: string) => `/apps/live/${encodeURIComponent(agency)}/${encodeURIComponent(route)}`;
