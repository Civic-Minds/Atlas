/**
 * Local only: one route's string-line data for one service day (scripts/live-segment-delay.ts --strings-dir), the
 * per-trip stop times behind the planner's string-line chart. Read from the `strings` folder beside LIVE_SEGMENTS_DIR.
 */
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { getPolledRoute } from '../shared/livePollingConfig.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  const date = params.get('date')?.trim();
  if (!agency || !route || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ noData: true }, 400);
  // Whitelist: only configured live routes and a strict date map to a file name (no path input reaches the filesystem).
  const cfg = getPolledRoute(agency, route);
  if (!cfg) return json({ noData: true }, 404);
  const dir = process.env.LIVE_SEGMENTS_DIR ?? resolve('../_live-data/out');
  try {
    return new Response(await readFile(resolve(dir, '..', 'strings', `${cfg.displayRouteShortName}-${date}.json`), 'utf8'), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ noData: true });
  }
}

export default { fetch: handler };
