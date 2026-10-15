/**
 * Local proof of concept: the last 30 minutes of archived positions for one
 * live route (read-only, from the atlas-live archive), so the Live card can
 * measure the real time gaps between the cars on the line right now.
 */
import { fetchRecentPositions } from '../shared/liveArchive.js';
import { getPolledRoute } from '../shared/livePollingConfig.js';

const WINDOW_MIN = 30;
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
  if (!cfg) return json({ noData: true });
  const key = `${cfg.slug}::${route}`;
  // The server's clock goes with every reply, so the card measures staleness against it, not the browser's.
  const withNow = (body: string) => `{"now":${Math.floor(Date.now() / 1000)},${body.slice(1)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(withNow(hit.body));
  try {
    const snaps = await fetchRecentPositions(cfg.slug, WINDOW_MIN);
    // Compact rows: [vehicleId, tripId, lat, lon, reportedAt]
    const snapshots = snaps
      .sort((a, b) => a.capturedAt - b.capturedAt)
      .map(s => ({
        capturedAt: s.capturedAt,
        v: s.vehicles
          .filter(v => (v.r ?? (v as { routeId?: string }).routeId) === route)
          .map(v => [v.id, (v as { tripId?: string }).tripId ?? '', v.lat, v.lon, v.t ?? s.capturedAt]),
      }));
    const body = JSON.stringify({ agency: cfg.slug, route, windowMin: WINDOW_MIN, snapshots });
    cache.set(key, { at: Date.now(), body });
    return json(withNow(body));
  } catch {
    return json({ error: 'archive unavailable' }, 503);
  }
}

export default { fetch: handler };
