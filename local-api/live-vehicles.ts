import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  LIVE_POLLING_ROUTES,
  isLiveApiServable,
  liveConfigRouteIds,
  liveMapArchiveFeed,
} from '../shared/livePollingConfig.js';
import { delayMinFromDelaySec } from '../shared/liveVehicleDelay.js';
import { joinLiveFeed, type LiveRecord, type LiveStopTime } from '../shared/liveJoin.js';
import { delayStatus } from '../shared/liveDelayStatus.js';
import { MovementSpeeds } from './movementSpeed.js';
import { LIVE_POLL_SEC } from '../shared/rules/live.js';
import { stopPlaces, type StopPlace } from './stopNames.js';
import type { UpcomingStop } from '../shared/livePatterns.js';
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
  names: ReadonlyMap<string, Pick<StopPlace, 'name'>>,
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
export function stoppedAtName(stops: readonly StopUpdate[] | null | undefined, names: ReadonlyMap<string, Pick<StopPlace, 'name'>>, nowSec: number): string | null {
  for (const s of stops ?? []) {
    const t = Number(s.departure?.time ?? s.arrival?.time);
    if (!Number.isFinite(t) || t < nowSec || !s.stopId) continue;
    const name = names.get(String(s.stopId))?.name;
    if (name) return name;
  }
  return null;
}

export function nextStopName(
  vehicle: { currentStatus?: number | null },
  stops: readonly StopUpdate[] | null | undefined,
  places: ReadonlyMap<string, Pick<StopPlace, 'name'>>,
  nowSec: number,
): string | null {
  if (vehicle.currentStatus === STOPPED_AT || !stops?.length) return null;
  for (const s of stops) {
    const t = Number(s.arrival?.time ?? s.departure?.time);
    if (!Number.isFinite(t) || t < nowSec || !s.stopId) continue;
    const name = places.get(String(s.stopId))?.name;
    if (name) return name;
  }
  return null;
}

/**
 * The stops a trip update lists still ahead of now (CIV-2047), in order, by name and place from the agency's stops file.
 * Not by id: the trip update gives GTFS stop ids, but the Live analysis patterns they are matched against key stops by the
 * agency's public stop number (TTC 510's "Union Station Streetcar Platform" is 1656 there; GTFS 1656 is on Wilson Ave).
 * A stop the file has no place for is left out.
 */
export function upcomingStops(stops: readonly StopUpdate[] | null | undefined, places: ReadonlyMap<string, StopPlace>, nowSec: number): UpcomingStop[] {
  const out: UpcomingStop[] = [];
  for (const st of stops ?? []) {
    if (!st.stopId || Number(st.arrival?.time ?? st.departure?.time) < nowSec) continue;
    const p = places.get(String(st.stopId));
    if (p?.lonLat) out.push({ name: p.name, lonLat: p.lonLat });
  }
  return out;
}

/**
 * Live's vehicles from joined records (CIV-2073), whether polled here or read from the recorder's v2 snapshot: route
 * names from `routeOf`, stop names from the agency's stops file, speed from movement between reports.
 */
export function vehiclesFromRecords(
  agency: string,
  records: readonly LiveRecord[],
  routeOf: (routeId: string) => { shortName: string; displayName: string } | undefined,
  places: ReadonlyMap<string, StopPlace>,
  nowSec: number,
  /** The trip updates' own timestamp (#1673), what the next stop is read against; `nowSec` without one. */
  feedNowSec: number = nowSec,
) {
  const vehicles = [];
  for (const rec of records) {
    const route = routeOf(rec.r);
    if (!route) continue;
    const delayMin = rec.delay == null ? null : delayMinFromDelaySec(rec.delay);
    // A stop with no time stays timeless (undefined, not 0), as the feed gave it; the departure is kept where it differs.
    const asUpdate = (list: readonly LiveStopTime[]) => ({
      stopTimeUpdate: list.map(([stopId, time, dep]) => ({ stopId, arrival: { time: time ?? undefined }, departure: { time: dep ?? time ?? undefined } })),
    });
    const own = rec.stu.length ? asUpdate(rec.stu) : undefined;
    const others = (rec.stuV ?? []).map(asUpdate);
    const vehicle = { currentStatus: rec.currentStatus as number | null };
    const stop = rec.tripId ? vehicleNextStop(vehicle, own, others, places, feedNowSec) : null;
    vehicles.push({
      id: rec.id,
      routeShortName: route.shortName,
      displayName: route.displayName,
      tripId: rec.tripId,
      lat: rec.lat,
      lon: rec.lon,
      bearing: rec.brg,
      // CIV-1770: from movement between reports, not the feed's momentary speed (TTC's read 0 for moving buses).
      speedKmh: movementSpeeds.speedFor(agency, rec.id, rec.lat, rec.lon, rec.t, nowSec),
      tsEpoch: rec.t,
      delayMin,
      headsign: rec.hs,
      directionId: rec.d,
      vehicleLabel: rec.label,
      // CIV-2024: the stop the feed says it is heading to or arriving at, by name; while it stands at a stop, that stop (CIV-2034).
      nextStop: stop?.name ?? null,
      ...(stop?.at ? { atStop: true } : {}),
      // CIV-2047: the stops its trip update lists ahead, by name and place, to tell its service pattern.
      upcomingStops: rec.tripId ? upcomingStops(own?.stopTimeUpdate, places, nowSec) : [],
      status: statusForDelay(delayMin),
      statusLabel: null,
      headwayGapMin: null,
    });
  }
  return vehicles;
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

  const [positions, updates, places, archiveRoutes] = await Promise.all([
    fetchFeed(positionsUrl, fetchOptions),
    tripsUrl ? fetchFeed(tripsUrl, fetchOptions) : Promise.resolve({ ok: false as const, reason: 'http-error' as const, detail: 'no trip feed' }),
    stopPlaces(agency),
    // The agency's route file: the archive's route names, and the ids each Live route has now (#1696).
    routeNames(agency),
  ]);

  if (!positions.ok) {
    return json({ error: failureMessage(positions.reason), reason: positions.reason }, 502, LIVE_CACHE_UPSTREAM_ERROR);
  }

  const routeById = new Map<string, { shortName: string; displayName: string }>();
  for (const route of configs) {
    for (const routeId of liveConfigRouteIds(route, archiveRoutes)) {
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

  const routeOf = (routeId: string) => routeById.get(routeId);
  // CIV-2073: the same join the cloud recorder stores (shared/liveJoin.ts), then the same reading of it (vehiclesFromRecords).
  const nowSec = Date.now() / 1000;
  const { records, headways } = joinLiveFeed(positions.data, updates.ok ? updates.data : null, id => routeOf(id)?.shortName, nowSec);
  // #1673: the next stop is read against the trip updates' own timestamp, not this server's clock.
  const feedHeaderSec = updates.ok ? Number(updates.data.header?.timestamp) : NaN;
  const feedNowSec = Number.isFinite(feedHeaderSec) && feedHeaderSec > 0 ? feedHeaderSec : nowSec;
  const vehicles = vehiclesFromRecords(agency, records, routeOf, places, nowSec, feedNowSec);

  return json({
    vehicles,
    headways,
    degraded: !updates.ok,
    degradedReason: updates.ok ? null : 'Arrival time and delay information is unavailable right now.',
  }, 200, LIVE_CACHE_OK);
}

export default { fetch: fetchHandler };
