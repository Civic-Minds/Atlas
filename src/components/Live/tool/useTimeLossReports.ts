import { useEffect, useState } from 'react';
import { recentSegmentData, type SegmentDelayData } from '../../../utils/segmentDelayView';

// One fetch per route and agency, kept for the page's life (the files change only when the analysis is rebuilt).
const cache = new Map<string, Promise<SegmentDelayData | null>>();

function load(agency: string, route: string): Promise<SegmentDelayData | null> {
  const key = `${agency}::${route}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/live-segments?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}&fields=segments`)
      .then(r => (r.ok ? r.json() : null))
      // The last LIVE_WINDOW_DAYS service dates, good days only ("Rolling 7 days only"), where the file has them.
      .then(j => (j && !j.noData && Array.isArray(j.segments) ? recentSegmentData(j as SegmentDelayData) : null))
      .catch(() => null);
    cache.set(key, p);
    p.then(d => { if (!d) cache.delete(key); });
  }
  return p;
}

/**
 * CIV-1828: every listed route's stop-pair figures (the time-loss report's input), for Studio's "Falls behind" views.
 * Only while `enabled`; routes without a file are left out. The map stays without colours until they arrive.
 */
/** One empty map for every render that has nothing loaded: a fresh one each time changed the map's model every render and looped (any measure but Falls behind, on Studio's Live page). */
const NONE: Map<string, SegmentDelayData> = new Map();

export function useTimeLossData(agency: string, routes: readonly string[], enabled: boolean): Map<string, SegmentDelayData> {
  const [data, setData] = useState<{ key: string; map: Map<string, SegmentDelayData> }>({ key: '', map: new Map() });
  const key = `${agency}|${routes.join(',')}`;
  useEffect(() => {
    if (!enabled || !agency || !routes.length) return;
    let cancelled = false;
    Promise.all(routes.map(r => load(agency, r).then(d => [r, d] as const))).then(pairs => {
      if (!cancelled) setData({ key, map: new Map(pairs.filter((p): p is readonly [string, SegmentDelayData] => !!p[1])) });
    });
    return () => { cancelled = true; };
  }, [enabled, agency, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return enabled && data.key === key ? data.map : NONE;
}
