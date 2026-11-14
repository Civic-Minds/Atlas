import { withMainPatternTrip, type LiveDashboardResponse } from '../../shared/liveDashboard';
import { liveDashboardDataUrl, liveDataMissing } from './liveReportData';
import { liveNoRoute } from '../content/noticeCopy';

/** How long a route's file is reused without asking again (the files change when an analysis is rebuilt, not by the minute). */
const KEEP_MS = 2 * 60 * 1000;
const cache = new Map<string, { at: number; answer: Promise<LiveDashboardResponse> }>();

/**
 * A route's dashboard file, fetched once however many places ask: the planner asks for the picked route and for every route
 * (and dev's double-run effects ask again), and each file is 0.4-0.9 MB, so every extra ask is a wasted download.
 * A failed fetch is forgotten at once so the next ask retries. Run time is read over each direction's main pattern
 * here, once, so the planner, the route page and the route card show the same figure as the network list (#1149, CIV-945).
 */
export function fetchLiveDashboard(agency: string, route: string): Promise<LiveDashboardResponse> {
  const url = liveDashboardDataUrl(agency, route);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.answer;
  const answer = fetch(url).then(r => (liveDataMissing(r) ? { status: 'unknown_route', reason: liveNoRoute(route, agency) } as LiveDashboardResponse : (r.json() as Promise<LiveDashboardResponse>).then(mainPatternRunTime)));
  cache.set(url, { at: Date.now(), answer });
  answer.catch(() => { if (cache.get(url)?.answer === answer) cache.delete(url); });
  return answer;
}

/** Forget every kept file (tests). */
export const clearLiveDashboardCache = () => cache.clear();

/** A ready file's run time over each direction's main pattern (withMainPatternTrip); other answers as they are. */
function mainPatternRunTime(data: LiveDashboardResponse): LiveDashboardResponse {
  return data.status === 'ready' ? { ...data, v3: withMainPatternTrip(data.v3) } : data;
}
