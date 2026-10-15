import { getLiveRouteConfig, isLiveApiServable } from '../shared/livePollingConfig.js';
import { computeLiveAdherence } from '../shared/computeLiveAdherence.js';
import { isRateLimited, rateLimitWebResponse } from '../shared/rateLimit.js';
import { requestHeader } from '../shared/request.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function handler(req: Request): Promise<Response> {
  const ip = requestHeader(req, 'x-real-ip') ?? requestHeader(req, 'x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) return rateLimitWebResponse();

  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const route = params.get('route')?.trim();
  if (!agency || !route) return json({ error: 'agency and route are required' }, 400);

  // Only configured, servable routes ever reach an upstream feed.
  if (!isLiveApiServable(agency) || !getLiveRouteConfig(agency, route)) return json({ noData: true });

  try {
    const result = await computeLiveAdherence(agency, route);
    if (!result || (result.arrivals.length === 0 && result.trips.length === 0)) return json({ noData: true });
    return json(result);
  } catch (err) {
    console.error('[live-adherence]', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

export default { fetch: handler };
