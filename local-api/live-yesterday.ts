/**
 * Local only: the Live Yesterday view for a route (?agency&route) or the network (?agency), built on the fly from the
 * analysis files the same way scripts/live-yesterday.ts builds the published ones.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { LIVE_ANALYSIS_ROUTES, getPolledRoute } from '../shared/livePollingConfig.js';
import { LIVE_DASHBOARD_HOLD, type LiveV3 } from '../shared/liveDashboard.js';
import { agencyYesterday, yesterdayFromV3, type LiveYesterday } from '../shared/liveYesterday.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function routeDay(dir: string, slug: string, route: string): LiveYesterday | null {
  const file = resolve(dir, `${slug}-${route}-segments.json`);
  return existsSync(file) ? yesterdayFromV3(JSON.parse(readFileSync(file, 'utf8')).v3 as LiveV3, slug, route) : null;
}

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim().toLowerCase() ?? '';
  const route = params.get('route')?.trim();
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  if (route) {
    // Whitelist: only configured live routes map to a file name (no path input reaches the filesystem).
    const cfg = getPolledRoute(agency, route);
    if (!cfg) return json({ status: 'unknown_route' }, 404);
    const y = routeDay(dir, cfg.slug, cfg.displayRouteShortName);
    return y ? json({ status: 'ready', ...y }) : json({ status: 'no_analysis' });
  }
  if (!/^[a-z0-9-]+$/.test(agency)) return json({ status: 'unknown_agency' }, 404);
  const routes = LIVE_ANALYSIS_ROUTES.filter(k => k.startsWith(`${agency}::`)).map(k => k.split('::')[1]).filter(r => !LIVE_DASHBOARD_HOLD[`${agency}::${r}`]);
  const net = agencyYesterday(agency, routes.flatMap(r => { const y = routeDay(dir, agency, r); return y ? [y] : []; }));
  return net ? json({ status: 'ready', ...net }) : json({ status: 'no_analysis' });
}

export default { fetch: handler };
