/**
 * Local only: every measured gap at each stop of one Live route (the gaps-through-the-day chart), the -gaps.json file
 * scripts/live-segment-delay.ts writes beside the route analysis. Loaded by the full analysis only when it is shown.
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { getPolledRoute } from '../shared/livePollingConfig.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  // Whitelist: only configured live routes map to a file name (no path input reaches the filesystem).
  const cfg = agency && route ? getPolledRoute(agency, route) : undefined;
  if (!cfg) return json({ status: 'unknown_route' }, 404);
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  try {
    return json({ status: 'ready', ...JSON.parse(await readFile(resolve(dir, `${cfg.slug}-${cfg.displayRouteShortName}-gaps.json`), 'utf8')) });
  } catch {
    return json({ status: 'no_analysis' });
  }
}

export default { fetch: handler };
