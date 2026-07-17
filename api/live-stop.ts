import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { fetchRecentPositions } from '../shared/liveArchive.js';
import { haversineM } from '../shared/shapeProjection.js';

export const config = {
  maxDuration: 60,
};

// Archived positions are TTC streetcars only, so this only ever applies there.
const OBSERVED_ARRIVALS_SLUG = 'ttc';
const OBSERVED_WINDOW_MINUTES = 60;
const STOP_MATCH_MAX_DIST_M = 80;

interface ObservedArrival {
  route: string;
  epoch: number;
}

/**
 * Estimate recent passage times at a stop from archived GPS positions:
 * for each vehicle, the sample closest to the stop (within ~80m) is treated
 * as its passage moment. This is "what actually happened," distinct from
 * the predicted arrivals below ("what the schedule/RT feed says should").
 */
async function fetchObservedArrivals(
  routeIdToShortName: Map<string, string>,
  stopLat: number,
  stopLon: number,
): Promise<ObservedArrival[]> {
  const snapshots = await fetchRecentPositions(OBSERVED_ARRIVALS_SLUG, OBSERVED_WINDOW_MINUTES);

  const bestByVehicle = new Map<string, { distM: number; epoch: number; route: string }>();
  for (const { capturedAt, vehicles } of snapshots) {
    for (const v of vehicles) {
      const routeShortName = routeIdToShortName.get(v.r);
      if (!routeShortName) continue;
      const distM = haversineM(v.lat, v.lon, stopLat, stopLon);
      if (distM > STOP_MATCH_MAX_DIST_M) continue;
      const epoch = v.t ?? capturedAt;
      const existing = bestByVehicle.get(v.id);
      if (!existing || distM < existing.distM) {
        bestByVehicle.set(v.id, { distM, epoch, route: routeShortName });
      }
    }
  }

  return [...bestByVehicle.values()]
    .map(({ epoch, route }) => ({ route, epoch }))
    .sort((a, b) => b.epoch - a.epoch)
    .slice(0, 8);
}

/**
 * Live arrivals at a single stop, from the agency's GTFS-RT TripUpdates:
 * upcoming predicted arrivals across all live-configured routes serving it,
 * plus the observed gap between them ("coming every ~N min right now").
 * When stop coordinates are supplied and the agency has archived positions
 * (TTC only today), also returns recently *observed* passages from GPS —
 * what actually happened, not just what the feed predicts.
 */
export default async function handler(req: Request) {
  const raw = req.url ?? '';
  const qs = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw);
  const agencySlug = qs.get('agency');
  const stopId = qs.get('stop');
  const stopLat = qs.get('lat') != null ? Number(qs.get('lat')) : null;
  const stopLon = qs.get('lon') != null ? Number(qs.get('lon')) : null;

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
  if (apiKeyParam) {
    const paramName = cfg.apiKeyParamName ?? 'apikey';
    url += (url.includes('?') ? '&' : '?') + `${paramName}=${encodeURIComponent(apiKeyParam)}`;
  }
  if (apiKeyHeader) headers['apikey'] = apiKeyHeader;

  const routeIdToShortName = new Map<string, string>();
  for (const c of configs) {
    for (const rid of c.routeIds) routeIdToShortName.set(rid, c.displayRouteShortName);
  }

  const measuredArrivalsPromise: Promise<ObservedArrival[]> =
    agencySlug === OBSERVED_ARRIVALS_SLUG && stopLat != null && stopLon != null && Number.isFinite(stopLat) && Number.isFinite(stopLon)
      ? fetchObservedArrivals(routeIdToShortName, stopLat, stopLon).catch(() => [])
      : Promise.resolve([]);

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

    const measuredArrivals = await measuredArrivalsPromise;

    return new Response(
      JSON.stringify({ now, arrivals: arrivals.slice(0, 8), observedGapMin, measuredArrivals }),
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
