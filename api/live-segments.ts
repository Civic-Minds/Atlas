/**
 * Local proof of concept: serves precomputed "where vehicles lose time"
 * stats (scripts/live-segment-delay.ts) for a live route. Data lives on
 * local disk only (LIVE_SEGMENTS_DIR, default ../_live-data/out).
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { getPolledRoute } from '../shared/livePollingConfig.js';

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
  // Whitelist: only configured live routes map to a file name (no path input reaches the filesystem).
  const cfg = getPolledRoute(agency, route);
  if (!cfg) return json({ noData: true });
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  try {
    const raw = await readFile(resolve(dir, `${cfg.slug}-${cfg.displayRouteShortName}-segments.json`), 'utf8');
    return new Response(raw, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ noData: true });
  }
}

export default { fetch: handler };
