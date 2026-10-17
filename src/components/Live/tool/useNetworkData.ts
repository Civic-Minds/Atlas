import { useEffect, useState } from 'react';
import type { LiveDashboardResponse } from '../../../../shared/liveDashboard';
import { fetchLiveDashboard } from '../../../lib/liveDashboardFetch';

export type ReadyRoute = Extract<LiveDashboardResponse, { status: 'ready' }>;

/** Every analysed route's analysis (the whole ready response), fetched side by side; a route shows up as soon as its file arrives, and picking it later needs no second fetch. */
export default function useNetworkData(agency: string, routes: readonly string[], first: string | null = null): Map<string, ReadyRoute> {
  const [data, setData] = useState<Map<string, ReadyRoute>>(new Map());
  const key = routes.join(',');
  useEffect(() => {
    let live = true;
    setData(new Map());
    const load = (r: string) => fetchLiveDashboard(agency, r)
      .then((body: LiveDashboardResponse) => { if (live && body.status === 'ready' && body.v3) setData(prev => new Map(prev).set(r, body)); })
      .catch(() => undefined);
    // The picked route goes alone first, so its figures get the whole connection (nine files of 0.4-0.9 MB at once each slow the others down); the rest follow as soon as it is in.
    if (first && routes.includes(first)) void load(first).then(() => { if (live) routes.filter(r => r !== first).forEach(load); });
    else routes.forEach(load);
    return () => { live = false; };
  }, [agency, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}
