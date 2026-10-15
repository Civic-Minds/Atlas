/**
 * Local only: the Live route dashboard's data (B1-B4, the `v3` block of the analysis file) and whether it exists.
 * The route card asks this before it shows its "Full analysis" link, so the link never leads to an empty page.
 * Always answers with a status; `reason` is a plain sentence (what is missing and what to do).
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { getPolledRoute } from '../shared/livePollingConfig.js';
import { LIVE_DASHBOARD_NOTES, dashboardUnavailable, type LiveDashboardResponse, type LiveV3 } from '../shared/liveDashboard.js';

function json(body: LiveDashboardResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  if (!agency || !route) return json({ status: 'unknown_route', reason: 'Give an agency and a route, for example ?agency=ttc&route=505.' }, 400);
  // Whitelist: only configured live routes map to a file name (no path input reaches the filesystem).
  const cfg = getPolledRoute(agency, route);
  if (!cfg) return json({ status: 'unknown_route', reason: `Live has no route ${route} for ${agency}.` }, 404);
  const unavailable = dashboardUnavailable(cfg.slug, cfg.displayRouteShortName);
  if (unavailable) return json(unavailable);
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  const file = `${cfg.slug}-${cfg.displayRouteShortName}-segments.json`;
  try {
    const data = JSON.parse(await readFile(resolve(dir, file), 'utf8')) as { generatedAt: string; replacementBuses?: boolean; v3?: LiveV3 };
    if (!data.v3 || data.v3.schema !== 3) {
      return json({ status: 'no_analysis', reason: `The analysis file for ${cfg.displayRouteShortName} is from an older version. Rebuild it with "npm run live:analyze -- ${cfg.displayRouteShortName}".` });
    }
    return json({
      status: 'ready', agency: cfg.slug, route: cfg.displayRouteShortName, generatedAt: data.generatedAt,
      replacementBuses: data.replacementBuses === true, v3: data.v3, note: LIVE_DASHBOARD_NOTES[`${cfg.slug}::${cfg.displayRouteShortName}`] ?? null,
    });
  } catch {
    return json({ status: 'no_analysis', reason: `No analysis file for ${cfg.displayRouteShortName} yet. Build it with "npm run live:analyze -- ${cfg.displayRouteShortName}" (needs the archive and timetable in ../_live-data).` });
  }
}

export default { fetch: handler };
