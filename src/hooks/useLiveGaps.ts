import { useEffect, useState } from 'react';
import { liveGapsDataUrl } from '../lib/liveReportData';

/** One stop's gaps: minutes after the service day's start, the gap and the timetable's typical gap, in seconds. */
export interface StopGaps { m: number[]; g: number[]; s: number[] }
export interface LiveGaps { dates: string[]; directions: Record<string, Record<string, StopGaps>> }

/** Every measured gap at each stop of a route, for the gaps-through-the-day chart. Null while loading or when absent. */
export function useLiveGaps(agency: string | null | undefined, route: string | null | undefined): LiveGaps | null {
  const [data, setData] = useState<LiveGaps | null>(null);
  useEffect(() => {
    if (!agency || !route) return;
    let live = true;
    fetch(liveGapsDataUrl(agency, route))
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (live) setData(d && d.status !== 'no_analysis' && d.directions ? d as LiveGaps : null); })
      .catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [agency, route]);
  return data;
}
