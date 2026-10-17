import { useEffect, useState } from 'react';
import type { LiveDashboardResponse } from '../../../../shared/liveDashboard';
import { liveDashboardDataUrl } from '../../../lib/liveReportData';

export type ReadyRoute = Extract<LiveDashboardResponse, { status: 'ready' }>;

/** Every analysed route's analysis (the whole ready response), fetched side by side; a route shows up as soon as its file arrives, and picking it later needs no second fetch. */
export default function useNetworkData(agency: string, routes: readonly string[]): Map<string, ReadyRoute> {
  const [data, setData] = useState<Map<string, ReadyRoute>>(new Map());
  const key = routes.join(',');
  useEffect(() => {
    let live = true;
    setData(new Map());
    for (const r of routes) {
      fetch(liveDashboardDataUrl(agency, r))
        .then(res => res.json())
        .then((body: LiveDashboardResponse) => { if (live && body.status === 'ready' && body.v3) setData(prev => new Map(prev).set(r, body)); })
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [agency, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}
