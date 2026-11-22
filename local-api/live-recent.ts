/**
 * Local only: the last half hour of a live route's recorded positions, so the Live route card can measure gaps as soon as
 * it opens (CIV-2047, Ryan: the card must show gaps at once) instead of waiting for its own polls to build up. Read
 * through route_now's reader (scripts/mcp/liveNowData.ts nowSource: the read-only token, never the R2 write keys), over
 * the same window (NOW_WINDOW_MIN), so the card and route_now read the same recordings. Without the token it answers
 * `noData` and the card builds its history from the map's polls, as before.
 */
import { nowSource, nowSec } from '../scripts/mcp/liveNowData.js';
import { NOW_WINDOW_MIN } from '../shared/liveNow.js';
import { getPolledRoute, matchesLiveRouteId } from '../shared/livePollingConfig.js';

const CACHE_MS = 20_000;
const cache = new Map<string, { at: number; body: string }>();

function json(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function handler(req: Request): Promise<Response> {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  if (!agency || !route) return json({ error: 'agency and route are required' }, 400);
  // Whitelist: only configured live routes.
  const cfg = getPolledRoute(agency, route);
  const source = nowSource();
  if (!cfg || !source) return json({ noData: true });
  const key = `${cfg.slug}::${route}`;
  // The server's clock goes with every reply, so the card measures staleness against it, not the browser's.
  const withNow = (body: string) => `{"now":${nowSec()},${body.slice(1)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(withNow(hit.body));
  try {
    const now = nowSec();
    const snaps = await source.snapshots(cfg.slug, now - NOW_WINDOW_MIN * 60, now);
    // Compact rows, as the card keeps its polls: [vehicleId, tripId, lat, lon, reportedAt].
    const snapshots = snaps.map(s => ({
      capturedAt: s.capturedAt,
      v: s.vehicles.filter(v => matchesLiveRouteId(cfg, v.r)).map(v => [v.id, v.tripId ?? '', v.lat, v.lon, v.t ?? s.capturedAt]),
    }));
    const body = JSON.stringify({ agency: cfg.slug, route, windowMin: NOW_WINDOW_MIN, snapshots });
    cache.set(key, { at: Date.now(), body });
    return json(withNow(body));
  } catch {
    return json({ error: 'archive unavailable' }, 503);
  }
}

export default { fetch: handler };
