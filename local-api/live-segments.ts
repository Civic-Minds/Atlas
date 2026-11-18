/**
 * Local proof of concept: serves precomputed "where vehicles lose time"
 * stats (scripts/live-segment-delay.ts) for a live route. Data lives on
 * local disk only (LIVE_SEGMENTS_DIR, default ../_live-data/out).
 */
import { readFile, readdir } from 'fs/promises';
import { resolve } from 'path';
import { getPolledRoute, hasLiveAnalysis } from '../shared/livePollingConfig.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  if (!agency || !route) return json({ error: 'agency and route are required' }, 400);
  // Whitelist: a configured live route, or a route whose analysis file is in the folder listing (CIV-1828: Studio's
  // agencies). Only a name found in the listing reaches the filesystem, never the request's text.
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  const cfg = getPolledRoute(agency, route);
  const configured = cfg && hasLiveAnalysis(cfg.slug, cfg.displayRouteShortName) ? `${cfg.slug}-${cfg.displayRouteShortName}-segments.json` : null;
  const listed = (await readdir(dir).catch(() => [] as string[])).find(f => f === `${agency.toLowerCase()}-${route}-segments.json`);
  const file = configured ?? listed;
  if (!file) return json({ noData: true });
  try {
    const raw = await readFile(resolve(dir, file), 'utf8');
    // ?fields=segments: only what the time-loss views read (Studio's Live page loads every route of an agency at once).
    if (params.get('fields') === 'segments') {
      const d = JSON.parse(raw) as Record<string, unknown>;
      return json({ agency: d.agency, route: d.route, generatedAt: d.generatedAt, dates: d.dates, directionLabels: d.directionLabels, observations: d.observations, segments: d.segments });
    }
    return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ noData: true });
  }
}

export default { fetch: handler };
