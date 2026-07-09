import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';

export const config = {
  maxDuration: 30,
};

/**
 * Live arrivals at a single stop, from the agency's GTFS-RT TripUpdates:
 * upcoming predicted arrivals across all live-configured routes serving it,
 * plus the observed gap between them ("coming every ~N min right now").
 */
export default async function handler(req: Request) {
  const raw = req.url ?? '';
  const qs = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw);
  const agencySlug = qs.get('agency');
  const stopId = qs.get('stop');

  if (!agencySlug || !stopId) {
    return new Response(JSON.stringify({ error: 'agency and stop are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const configs = LIVE_POLLING_ROUTES.filter(r => r.slug === agencySlug);
  if (configs.length === 0) {
    return new Response(JSON.stringify({ error: `No live config for agency: ${agencySlug}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cfg = configs[0];
  const apiKeyParam = cfg.apiKeyParamEnvVar ? process.env[cfg.apiKeyParamEnvVar] : undefined;
  const apiKeyHeader = cfg.apiKeyHeaderEnvVar ? process.env[cfg.apiKeyHeaderEnvVar] : undefined;

  let url = cfg.tripUpdatesUrl;
  const headers: Record<string, string> = {
    'User-Agent': 'atlas-live-stop/1.0 (https://atlas-gamma-two.vercel.app)',
  };
  if (apiKeyParam) url += (url.includes('?') ? '&' : '?') + `apikey=${encodeURIComponent(apiKeyParam)}`;
  if (apiKeyHeader) headers['apikey'] = apiKeyHeader;

  const routeIdToShortName = new Map<string, string>();
  for (const c of configs) {
    for (const rid of c.routeIds) routeIdToShortName.set(rid, c.displayRouteShortName);
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(
      GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer)),
      { longs: String, enums: String },
    );

    const now = Number(feed.header?.timestamp ?? Math.floor(Date.now() / 1000));
    const arrivals: { route: string; epoch: number }[] = [];

    for (const e of (feed.entity as any[]) ?? []) {
      const tu = e.tripUpdate;
      if (!tu) continue;
      const schedRel = tu.trip?.scheduleRelationship;
      if (schedRel === 'DELETED' || schedRel === 'CANCELED') continue;
      const routeShortName = routeIdToShortName.get(tu.trip?.routeId);
      if (!routeShortName) continue;
      for (const stu of tu.stopTimeUpdate ?? []) {
        if (String(stu.stopId) !== stopId) continue;
        const t = Number(stu.arrival?.time ?? stu.departure?.time);
        if (!Number.isFinite(t) || t <= 0 || t < now - 60) continue;
        arrivals.push({ route: routeShortName, epoch: t });
      }
    }

    arrivals.sort((a, b) => a.epoch - b.epoch);

    // Observed gap: median between successive arrivals at this stop (all live routes pooled)
    let observedGapMin: number | null = null;
    if (arrivals.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < arrivals.length; i++) {
        const g = (arrivals[i].epoch - arrivals[i - 1].epoch) / 60;
        if (g > 0 && g <= 180) gaps.push(g);
      }
      if (gaps.length >= 2) {
        gaps.sort((a, b) => a - b);
        observedGapMin = Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10;
      }
    }

    return new Response(
      JSON.stringify({ now, arrivals: arrivals.slice(0, 8), observedGapMin }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15',
        },
      },
    );
  } catch (err) {
    console.error('[live-stop]', err);
    return new Response(JSON.stringify({ error: 'Feed unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
