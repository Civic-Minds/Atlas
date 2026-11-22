import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  LIVE_POLLING_ROUTES,
  isLiveApiServable,
  liveMapArchiveFeed,
} from '../shared/livePollingConfig.js';
import { delayMinFromDelaySec, explicitTripDelaySec } from '../shared/liveVehicleDelay.js';
import { delayStatus } from '../shared/liveDelayStatus.js';
import { MovementSpeeds } from './movementSpeed.js';
import { LIVE_POLL_SEC } from '../shared/rules/live.js';
import { stopNames } from './stopNames.js';
import { routeNames } from './routeNames.js';

const FEED_TIMEOUT_MS = 15_000;
/** CIV-1770: speeds from movement between polls, across requests. */
const movementSpeeds = new MovementSpeeds();
const USER_AGENT = 'atlas-local-live/1.0 (https://transitatlas.fyi)';

type FeedResult =
  | { ok: true; data: any }
  | { ok: false; reason: 'timeout' | 'http-error' | 'decode-error'; detail: string };
type FeedFailure = 'timeout' | 'http-error' | 'decode-error';

// Vehicles are shared across viewers for ~15 s at the edge, so repeat calls
// don't each hit the agency's API (and spend its key).
const LIVE_CACHE_OK = `public, max-age=0, s-maxage=${LIVE_POLL_SEC}, stale-while-revalidate=${LIVE_POLL_SEC}`;
// A brief edge cache on upstream failures stops retries from hammering a struggling feed.
const LIVE_CACHE_UPSTREAM_ERROR = 'public, max-age=0, s-maxage=5';

function json(body: unknown, status = 200, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl,
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

// Only a single slug-shaped `agency` param is accepted: extra params would vary the edge cache key.
function requestAgency(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  const names = [...params.keys()];
  if (names.length !== 1 || names[0] !== 'agency') return null;
  const agency = params.get('agency') ?? '';
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(agency) ? agency : null;
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
  return delayStatus(delayMin);
}

const STOPPED_AT = GtfsRealtimeBindings.transit_realtime.VehiclePosition.VehicleStopStatus.STOPPED_AT;
type StopUpdate = { stopId?: string | null; arrival?: { time?: unknown } | null; departure?: { time?: unknown } | null };
/**
 * The vehicle's next stop by name (CIV-2024, #1653): the first stop in its trip update still ahead of `nowSec` that the
 * agency's stops file names. Never the position's own stop_id: TTC's are not GTFS stops (the ones that "match" a stop
 * number lie a median 11.6 km away), so they named the wrong stop. None while the vehicle stands at a stop (Ryan hasn't
 * worded "At stop" yet) or without a trip update. The one place the card's stop is chosen: a fallback (the nearest
 * stop ahead along the route) would go here.
 */
/**
 * #1673: the vehicle's next stop from its trip updates: the one for its trip first, then any other update the feed
 * carries for the vehicle (at a trip's end, its next trip), the first that still has a stop ahead.
 */
export function vehicleNextStop(
  vehicle: { currentStatus?: number | null },
  tripUpdate: { stopTimeUpdate?: readonly StopUpdate[] | null } | undefined,
  vehicleUpdates: readonly { stopTimeUpdate?: readonly StopUpdate[] | null }[] | undefined,
  names: ReadonlyMap<string, string>,
  nowSec: number,
): { name: string; at: boolean } | null {
  const at = vehicle.currentStatus === STOPPED_AT;
  for (const u of [tripUpdate, ...(vehicleUpdates ?? []).filter(v => v !== tripUpdate)]) {
    const name = !u ? null : at ? stoppedAtName(u.stopTimeUpdate, names, nowSec) : nextStopName(vehicle, u.stopTimeUpdate, names, nowSec);
    if (name) return { name, at };
  }
  return null;
}

/**
 * CIV-2034 (Ryan, 2026-11-21, "1"): the stop a vehicle stands at, for the card's "At <stop>": the first stop in its trip
 * update it has not yet left (its departure, else its arrival, still ahead), by name.
 */
export function stoppedAtName(stops: readonly StopUpdate[] | null | undefined, names: ReadonlyMap<string, string>, nowSec: number): string | null {
  for (const s of stops ?? []) {
    const t = Number(s.departure?.time ?? s.arrival?.time);
    if (!Number.isFinite(t) || t < nowSec || !s.stopId) continue;
    const name = names.get(String(s.stopId));
    if (name) return name;
  }
  return null;
}

export function nextStopName(
  vehicle: { currentStatus?: number | null },
  stops: readonly StopUpdate[] | null | undefined,
  names: ReadonlyMap<string, string>,
  nowSec: number,
): string | null {
  if (vehicle.currentStatus === STOPPED_AT || !stops?.length) return null;
  for (const s of stops) {
    const t = Number(s.arrival?.time ?? s.departure?.time);
    if (!Number.isFinite(t) || t < nowSec || !s.stopId) continue;
    const name = names.get(String(s.stopId));
    if (name) return name;
  }
  return null;
}

async function fetchHandler(request: Request): Promise<Response> {
  const agency = requestAgency(request);
  if (!agency) return json({ error: 'A single valid agency slug is required' }, 400);

  if (!isLiveApiServable(agency)) {
    return json({ error: 'Unknown, inactive, or unconfigured agency' }, 404);
  }

  const configs = LIVE_POLLING_ROUTES.filter(route => route.slug === agency);
  // CIV-2046: an agency the map shows from the archiver's own feed entry (Kingston, the MBTA): its URLs and route filter.
  const archive = configs.length === 0 ? liveMapArchiveFeed(agency) : null;
  const config = configs[0];
  const fetchOptions = config ? {
    apiKeyParam: config.apiKeyParamEnvVar ? process.env[config.apiKeyParamEnvVar] : undefined,
    apiKeyParamName: config.apiKeyParamName,
    apiKeyHeader: config.apiKeyHeaderEnvVar ? process.env[config.apiKeyHeaderEnvVar] : undefined,
  } : {};
  const positionsUrl = config?.vehiclePositionsUrl ?? archive?.positions.url;
  const tripsUrl = config?.tripUpdatesUrl ?? archive?.tripUpdatesUrl ?? null;
  if (!positionsUrl) return json({ error: 'Unknown, inactive, or unconfigured agency' }, 404);

  const [positions, updates, names, archiveRoutes] = await Promise.all([
    fetchFeed(positionsUrl, fetchOptions),
    tripsUrl ? fetchFeed(tripsUrl, fetchOptions) : Promise.resolve({ ok: false as const, reason: 'http-error' as const, detail: 'no trip feed' }),
    stopNames(agency),
    archive ? routeNames(agency) : Promise.resolve(null),
  ]);

  if (!positions.ok) {
    return json({ error: failureMessage(positions.reason), reason: positions.reason }, 502, LIVE_CACHE_UPSTREAM_ERROR);
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
  if (archive && archiveRoutes) {
    // The archiver's own route filter, so the map shows the routes it records (the MBTA's full feed carries every mode).
    const filter = new RegExp(archive.positions.routeFilterSource);
    for (const [routeId, name] of archiveRoutes) if (filter.test(routeId)) routeById.set(routeId, name);
  }

  const updatesByTrip = new Map<string, any>();
  /**
   * CIV-2024 (#1653): trip updates by their vehicle, for a position whose trip id the updates don't use. Every update
   * a vehicle has (#1673): at a trip's end the feed already carries its next trip under the same vehicle.
   */
  const updatesByVehicle = new Map<string, any[]>();
  const headwaysByRoute = new Map<string, number[]>();
  // #1673: stop times are read against the trip updates' own timestamp, not this server's clock: the feed is often
  // 15-25 s old, and a stop a few seconds "past" by the clock is still ahead in the feed.
  const feedHeaderSec = updates.ok ? Number(updates.data.header?.timestamp) : NaN;
  const feedNowSec = Number.isFinite(feedHeaderSec) && feedHeaderSec > 0 ? feedHeaderSec : Date.now() / 1000;
  if (updates.ok) {
    for (const entity of updates.data.entity ?? []) {
      const tripUpdate = entity.tripUpdate;
      const tripId = tripUpdate?.trip?.tripId;
      const route = tripUpdate?.trip?.routeId ? routeById.get(tripUpdate.trip.routeId) : undefined;
      if (!tripId || !route) continue;
      updatesByTrip.set(tripId, tripUpdate);
      if (tripUpdate.vehicle?.id) {
        const key = String(tripUpdate.vehicle.id);
        const list = updatesByVehicle.get(key);
        if (list) list.push(tripUpdate); else updatesByVehicle.set(key, [tripUpdate]);
      }

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
      // CIV-1770: from movement between reports, not the feed's momentary speed (TTC's read 0 for moving buses).
      speedKmh: movementSpeeds.speedFor(agency, String(vehicle.vehicle?.id ?? tripId ?? `${lat},${lon}`), lat, lon,
        vehicle.timestamp == null ? null : Number(vehicle.timestamp), Date.now() / 1000),
      tsEpoch: vehicle.timestamp == null ? null : Number(vehicle.timestamp),
      delayMin,
      headsign,
      directionId: vehicle.trip?.directionId == null ? null : Number(vehicle.trip.directionId),
      vehicleLabel: vehicle.vehicle?.label ?? null,
      // CIV-2024: the stop the feed says it is heading to or arriving at, by name; while it stands at a stop, that stop (CIV-2034).
      ...(() => {
        const stop = tripId ? vehicleNextStop(vehicle, update, vehicle.vehicle?.id ? updatesByVehicle.get(String(vehicle.vehicle.id)) : undefined, names, feedNowSec) : null;
        return { nextStop: stop?.name ?? null, ...(stop?.at ? { atStop: true } : {}) };
      })(),
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
  }, 200, LIVE_CACHE_OK);
}

export default { fetch: fetchHandler };
