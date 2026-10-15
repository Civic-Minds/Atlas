import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { LIVE_POLLING_ROUTES, isLiveApiServable } from '../shared/livePollingConfig.js';
import { computeLiveStop } from '../shared/computeLiveStop.js';
import { isRateLimited, rateLimitWebResponse } from '../shared/rateLimit.js';
import { requestHeader } from '../shared/request.js';

const FEED_TIMEOUT_MS = 12_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function fetchTripUpdates(
  url: string,
  opts: { apiKeyParam?: string; apiKeyParamName?: string; apiKeyHeader?: string },
): Promise<{ entity?: any[] } | null> {
  let finalUrl = url;
  const headers: Record<string, string> = {};
  if (opts.apiKeyParam) {
    const name = opts.apiKeyParamName ?? 'apikey';
    finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(opts.apiKeyParam)}`;
  }
  if (opts.apiKeyHeader) headers.apikey = opts.apiKeyHeader;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(finalUrl, {
      headers: Object.keys(headers).length ? headers : undefined,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
      longs: Number,
      enums: String,
      bytes: String,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function handler(req: Request): Promise<Response> {
  const ip = requestHeader(req, 'x-real-ip') ?? requestHeader(req, 'x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) return rateLimitWebResponse();

  const params = new URL(req.url, 'http://localhost').searchParams;
  const agency = params.get('agency')?.trim();
  const stop = params.get('stop')?.trim();
  if (!agency || !stop) return json({ error: 'agency and stop are required' }, 400);
  if (stop.length > 64) return json({ error: 'Invalid stop' }, 400);

  // SSRF guard: only agencies in the live config (with keys present) reach an upstream.
  if (!isLiveApiServable(agency)) return json({ error: 'Unknown, inactive, or unconfigured agency' }, 404);

  const configs = LIVE_POLLING_ROUTES.filter(c => c.slug === agency);
  const cfg = configs[0];
  const routeNames = new Map<string, string>();
  for (const c of configs) for (const id of c.routeIds) routeNames.set(id, c.displayRouteShortName);

  const feed = await fetchTripUpdates(cfg.tripUpdatesUrl, {
    apiKeyParam: cfg.apiKeyParamEnvVar ? process.env[cfg.apiKeyParamEnvVar] : undefined,
    apiKeyParamName: cfg.apiKeyParamName,
    apiKeyHeader: cfg.apiKeyHeaderEnvVar ? process.env[cfg.apiKeyHeaderEnvVar] : undefined,
  });
  if (!feed) return json({ error: "Can't reach this feed right now." }, 502);

  const now = Math.floor(Date.now() / 1000);
  return json(computeLiveStop(feed, stop, now, { routeNames }));
}

export default { fetch: handler };
