import { useEffect, useState } from 'react';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import { liveDashboardDataUrl } from '../../../lib/liveReportData';

/** Every analysed route's analysis, fetched side by side; a route shows up as soon as its file arrives. */
export default function useNetworkData(agency: string, routes: readonly string[]): Map<string, LiveV3> {
  const [data, setData] = useState<Map<string, LiveV3>>(new Map());
  const key = routes.join(',');
  useEffect(() => {
    let live = true;
    setData(new Map());
    for (const r of routes) {
      fetch(liveDashboardDataUrl(agency, r))
        .then(res => res.json())
        .then((body: { status?: string; v3?: LiveV3 }) => { if (live && body.status === 'ready' && body.v3) setData(prev => new Map(prev).set(r, body.v3!)); })
        .catch(() => undefined);
    }
    return () => { live = false; };
  }, [agency, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}
