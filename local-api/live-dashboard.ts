/**
 * Local only: the Live route dashboard's data (B1-B4, the `v3` block of the analysis file) and whether it exists.
 * The route card asks this before it shows its "Full analysis" link, so the link never leads to an empty page.
 * Always answers with a status; `reason` is a plain sentence (what is missing and what to do).
 */
import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';
import { getPolledRoute, hasLiveAnalysis } from '../shared/livePollingConfig.js';
import { LIVE_DASHBOARD_NOTES, LIVE_DASHBOARD_UNCERTAIN_START, dashboardUnavailable, qualityHold, type LiveDashboardResponse, type LiveV3 } from '../shared/liveDashboard.js';

function json(body: LiveDashboardResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  if (!agency || !route) return json({ status: 'unknown_route', reason: 'Give an agency and a route, for example ?agency=ttc&route=505.' }, 400);
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  // Whitelist: a configured live route, or a route whose analysis file is in the folder listing. Only a name found in the
  // listing reaches the filesystem, never the request's text.
  const cfg = getPolledRoute(agency, route);
  const listed = (await readdir(dir).catch(() => [] as string[])).find(f => f === `${agency.toLowerCase()}-${route}-segments.json`);
  if (!cfg && !listed) return json({ status: 'unknown_route', reason: `Live has no analysis for ${agency.toUpperCase()} route ${route}. Build it with "npm run live:analyze -- ${route}".` }, 404);
  const slug = cfg?.slug ?? agency.toLowerCase();
  const name = cfg?.displayRouteShortName ?? route;
  const unavailable = dashboardUnavailable(slug, name, !!listed || hasLiveAnalysis(slug, name));
  if (unavailable) return json(unavailable);
  const file = listed ?? `${slug}-${name}-segments.json`;
  try {
    const data = JSON.parse(await readFile(resolve(dir, file), 'utf8')) as { generatedAt: string; replacementBuses?: boolean; v3?: LiveV3 };
    if (!data.v3 || data.v3.schema !== 3) {
      return json({ status: 'no_analysis', reason: `The analysis file for ${name} is from an older version. Rebuild it with "npm run live:analyze -- ${name}".` });
    }
    const quality = qualityHold(data.v3);
    if (quality) return json({ status: 'held', reason: `${slug.toUpperCase()} ${name} is held back: ${quality.charAt(0).toLowerCase()}${quality.slice(1)}` });
    const routeTitle = await readFile(resolve(dir, `${slug}-agency.json`), 'utf8')
      .then(t => (JSON.parse(t) as { routes?: Array<{ route: string; titleLabel?: string }> }).routes?.find(r => r.route === name)?.titleLabel ?? null)
      .catch(() => null);
    return json({
      status: 'ready', agency: slug, route: name, routeTitle, generatedAt: data.generatedAt,
      replacementBuses: data.replacementBuses === true, v3: data.v3, note: LIVE_DASHBOARD_NOTES[`${slug}::${name}`] ?? null,
      uncertainStart: [...(LIVE_DASHBOARD_UNCERTAIN_START[`${slug}::${name}`] ?? [])],
    });
  } catch {
    return json({ status: 'no_analysis', reason: `No analysis file for ${name} yet. Build it with "npm run live:analyze -- ${name}" (needs the archive and timetable in ../_live-data).` });
  }
}

export default { fetch: handler };
