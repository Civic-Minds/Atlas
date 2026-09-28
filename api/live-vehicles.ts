import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  LIVE_AGENCY_TIMEZONES,
  LIVE_POLLING_ROUTES,
  isLiveApiServable,
} from '../shared/livePollingConfig.js';
import { delayMinFromDelaySec, explicitTripDelaySec } from '../shared/liveVehicleDelay.js';

const FEED_TIMEOUT_MS = 15_000;
const USER_AGENT = 'atlas-local-live/1.0 (https://transitatlas.fyi)';

type FeedResult =
  | { ok: true; data: any }
  | { ok: false; reason: 'timeout' | 'http-error' | 'decode-error'; detail: string };
type FeedFailure = 'timeout' | 'http-error' | 'decode-error';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

async function fetchFeed(
  url: string,
  options: { apiKeyParam?: string; apiKeyParamName?: string; apiKeyHeader?: string },
): Promise<FeedResult> {
  let finalUrl = url;
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };

  if (options.apiKeyParam) {
    const name = options.apiKeyParamName ?? 'apikey';
    finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(options.apiKeyParam)}`;
  }
  if (options.apiKeyHeader) headers.apikey = options.apiKeyHeader;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(finalUrl, { headers, signal: controller.signal });
    if (!response.ok) {
      return { ok: false, reason: 'http-error', detail: `upstream returned HTTP ${response.status}` };
    }

    try {
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(await response.arrayBuffer()),
      );
      return {
        ok: true,
        data: GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
          longs: Number,
          enums: String,
          bytes: String,
        }),
      };
    } catch {
      return { ok: false, reason: 'decode-error', detail: 'upstream returned unreadable data' };
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      reason: timedOut ? 'timeout' : 'http-error',
      detail: timedOut ? 'upstream timed out' : 'could not reach upstream',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function requestAgency(request: Request): string | null {
  return new URL(request.url).searchParams.get('agency')?.trim() || null;
}

function failureMessage(reason: FeedFailure): string {
  switch (reason) {
    case 'timeout': return 'This feed is taking too long to respond.';
    case 'decode-error': return "This feed sent back data Atlas can't read.";
    default: return "Can't reach this feed right now.";
  }
}

function statusForDelay(delayMin: number | null): 'no_data' | 'early' | 'late' | 'on_time' {
  if (delayMin == null) return 'no_data';
  if (delayMin <= -1.5) return 'early';
  if (delayMin >= 5.5) return 'late';
  return 'on_time';
}

async function fetchHandler(request: Request): Promise<Response> {
  const agency = requestAgency(request);
  if (!agency) return json({ error: 'Agency slug is required' }, 400);

  if (!isLiveApiServable(agency)) {
    return json({ error: 'Unknown, inactive, or unconfigured agency' }, 404);
  }

  const configs = LIVE_POLLING_ROUTES.filter(route => route.slug === agency);
  const config = configs[0];
  const fetchOptions = {
    apiKeyParam: config.apiKeyParamEnvVar ? process.env[config.apiKeyParamEnvVar] : undefined,
    apiKeyParamName: config.apiKeyParamName,
    apiKeyHeader: config.apiKeyHeaderEnvVar ? process.env[config.apiKeyHeaderEnvVar] : undefined,
  };

  const [positions, updates] = await Promise.all([
    fetchFeed(config.vehiclePositionsUrl, fetchOptions),
    fetchFeed(config.tripUpdatesUrl, fetchOptions),
  ]);

  if (!positions.ok) {
    return json({ error: failureMessage(positions.reason), reason: positions.reason }, 502);
  }

  const routeById = new Map<string, { shortName: string; displayName: string }>();
  for (const route of configs) {
    for (const routeId of route.routeIds) {
      routeById.set(routeId, {
        shortName: route.displayRouteShortName,
        displayName: route.displayName ?? '',
      });
    }
  }

  const updatesByTrip = new Map<string, any>();
  const headwaysByRoute = new Map<string, number[]>();
  if (updates.ok) {
    for (const entity of updates.data.entity ?? []) {
      const tripUpdate = entity.tripUpdate;
      const tripId = tripUpdate?.trip?.tripId;
      const route = tripUpdate?.trip?.routeId ? routeById.get(tripUpdate.trip.routeId) : undefined;
      if (!tripId || !route) continue;
      updatesByTrip.set(tripId, tripUpdate);

      const arrivalsByStop = new Map<string, number[]>();
      for (const stop of tripUpdate.stopTimeUpdate ?? []) {
        const timestamp = Number(stop.arrival?.time ?? stop.departure?.time);
        if (!stop.stopId || !Number.isFinite(timestamp) || timestamp <= 0) continue;
        const arrivals = arrivalsByStop.get(String(stop.stopId)) ?? [];
        arrivals.push(timestamp);
        arrivalsByStop.set(String(stop.stopId), arrivals);
      }
      for (const arrivals of arrivalsByStop.values()) {
        arrivals.sort((a, b) => a - b);
        for (let index = 1; index < arrivals.length; index += 1) {
          const gap = (arrivals[index] - arrivals[index - 1]) / 60;
          if (gap > 0 && gap <= 180) {
            const gaps = headwaysByRoute.get(route.shortName) ?? [];
            gaps.push(gap);
            headwaysByRoute.set(route.shortName, gaps);
          }
        }
      }
    }
  }

  const headways: Record<string, { gapMin: number; samples: number }> = {};
  for (const [route, gaps] of headwaysByRoute) {
    gaps.sort((a, b) => a - b);
    headways[route] = {
      gapMin: Math.round(gaps[Math.floor(gaps.length / 2)] * 10) / 10,
      samples: gaps.length,
    };
  }

  const vehicles = [];
  for (const entity of positions.data.entity ?? []) {
    const vehicle = entity.vehicle;
    const route = vehicle?.trip?.routeId ? routeById.get(vehicle.trip.routeId) : undefined;
    const lat = Number(vehicle?.position?.latitude);
    const lon = Number(vehicle?.position?.longitude);
    if (!vehicle || !route || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tripId = String(vehicle.trip?.tripId ?? '');
    const update = tripId ? updatesByTrip.get(tripId) : undefined;
    const delaySeconds = update ? explicitTripDelaySec(update) : null;
    const delayMin = delaySeconds == null ? null : delayMinFromDelaySec(delaySeconds);
    const lastStop = update?.stopTimeUpdate?.at(-1);
    const headsign = update?.trip?.tripHeadsign ?? lastStop?.stopHeadsign ?? null;

    vehicles.push({
      id: String(vehicle.vehicle?.id ?? tripId ?? `${lat},${lon}`),
      routeShortName: route.shortName,
      displayName: route.displayName,
      tripId,
      lat,
      lon,
      bearing: vehicle.position?.bearing == null ? null : Number(vehicle.position.bearing),
      speedKmh: vehicle.position?.speed == null ? null : Math.round(Number(vehicle.position.speed) * 3.6),
      tsEpoch: vehicle.timestamp == null ? null : Number(vehicle.timestamp),
      delayMin,
      headsign,
      directionId: vehicle.trip?.directionId == null ? null : Number(vehicle.trip.directionId),
      vehicleLabel: vehicle.vehicle?.label ?? null,
      status: statusForDelay(delayMin),
      statusLabel: null,
      headwayGapMin: null,
    });
  }

  return json({
    vehicles,
    headways,
    degraded: !updates.ok,
    degradedReason: updates.ok ? null : 'Arrival time and delay information is unavailable right now.',
  });
}

export default { fetch: fetchHandler };
