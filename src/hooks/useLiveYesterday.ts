import { useEffect, useState } from 'react';
import type { LiveYesterday } from '../../shared/liveYesterday';
import { liveYesterdayDataUrl } from '../lib/liveReportData';

/** The Yesterday view's data for a route, or the network when `route` is null. Null while loading, when absent, or when `enabled` is false. */
export function useLiveYesterday(agency: string | null | undefined, route: string | null, enabled: boolean): LiveYesterday | null {
  const [data, setData] = useState<LiveYesterday | null>(null);
  useEffect(() => {
    if (!agency || !enabled) return;
    let live = true;
    fetch(liveYesterdayDataUrl(agency, route))
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live) setData(d && d.weekly ? d as LiveYesterday : null); })
      .catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [agency, route, enabled]);
  return data;
}
