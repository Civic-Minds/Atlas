import { useEffect, useState } from 'react';
import { fetchLiveDashboard } from '../lib/liveDashboardFetch';
import type { LiveV3 } from '../../shared/liveDashboard';

export interface RouteAnalysisPatterns {
  /** The analysis's run-time patterns per direction: main, branch, short turn. */
  patterns: NonNullable<NonNullable<LiveV3['runningTime']>['patterns']>;
  /** Every stop name the analysis has for the route. */
  stopNames: string[];
}

/**
 * A route's Live analysis patterns and stop names, for telling a short turn from a branch on a vehicle card
 * (CIV-1043). Asks only while `enabled` (a vehicle card is open); the file is cached (liveDashboardFetch). The value
 * is null while it loads, when the route has no analysis, and straight after a switch to another route (never the old
 * route's); settled is false only while it loads, so the card can wait for it instead of showing a guess (CIV-1068).
 */
export function useRouteAnalysis(slug: string | null, route: string | null, enabled: boolean): { value: RouteAnalysisPatterns | null; settled: boolean } {
  const key = slug && route ? `${slug}|${route}` : null;
  const [loaded, setLoaded] = useState<{ key: string; value: RouteAnalysisPatterns | null } | null>(null);
  useEffect(() => {
    if (!enabled || !slug || !route || !key) return;
    let live = true;
    fetchLiveDashboard(slug, route)
      .then(d => {
        if (live) setLoaded({ key, value: d.status === 'ready' && d.v3.runningTime?.patterns ? { patterns: d.v3.runningTime.patterns, stopNames: d.v3.stops.map(s => s.name) } : null });
      })
      .catch(() => { if (live) setLoaded({ key, value: null }); });
    return () => { live = false; };
  }, [enabled, slug, route, key]);
  if (!enabled || !key) return { value: null, settled: true };
  return loaded && loaded.key === key ? { value: loaded.value, settled: true } : { value: null, settled: false };
}

/** The patterns alone (see useRouteAnalysis). */
export function useRouteAnalysisPatterns(slug: string | null, route: string | null, enabled: boolean): RouteAnalysisPatterns | null {
  return useRouteAnalysis(slug, route, enabled).value;
}
