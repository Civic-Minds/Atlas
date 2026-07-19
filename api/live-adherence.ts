import { computeLiveAdherence } from '../shared/computeLiveAdherence.js';
import { getLiveRouteConfig, isLiveApiServable } from '../shared/livePollingConfig.js';
import { isRateLimited, rateLimitWebResponse } from '../shared/rateLimit.js';
import { requestHeader } from '../shared/request.js';

export const config = { maxDuration: 60 };

function queryParams(req: Request & { url?: string }): URLSearchParams {
  const raw = req.url ?? '';
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  return new URLSearchParams(qs);
}

export default async function handler(req: Request) {
  const ip = requestHeader(req, 'x-real-ip') ?? requestHeader(req, 'x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) {
    return rateLimitWebResponse();
  }

  const agency = queryParams(req).get('agency');
  const route = queryParams(req).get('route');

  if (!agency || !route || !isLiveApiServable(agency) || !getLiveRouteConfig(agency, route)) {
    return new Response(JSON.stringify({ error: 'Invalid agency/route pair.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await computeLiveAdherence(agency, route);
    if (!data || data.arrivals.length === 0) {
      return new Response(JSON.stringify({ noData: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (err: unknown) {
    console.error('[live-adherence]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
