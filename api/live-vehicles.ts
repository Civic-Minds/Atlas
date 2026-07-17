import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { GeoJSON } from 'geojson';
import { LIVE_POLLING_ROUTES, LIVE_AGENCY_TIMEZONES } from '../shared/livePollingConfig.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import {
  delayFromTripUpdate,
  delayMinFromDelaySec,
  explicitTripDelaySec,
  serviceDayStartEpoch,
} from '../shared/liveVehicleDelay.js';
import { isRateLimited } from '../shared/rateLimit.js';
import { vehicleHeadwayGapMinFromShape } from '../shared/liveHeadway.js';
import { pickBestShape, shapesFromGeometry, type Shape } from '../shared/shapeProjection.js';
import { fetchRecentPositions } from '../shared/liveArchive.js';

export const config = {
  maxDuration: 60,
};

// Same threshold used by scripts/streetcar-headways.ts for consistency.
const TTC_SHAPE_MATCH_MAX_DIST_M = 120;

function queryParams(req: Request & { url?: string }): URLSearchParams {
  const raw = req.url ?? '';
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  return new URLSearchParams(qs);
}

/** Read a request header from either Fetch's Headers or Vercel's Node headers. */
function requestHeader(req: Request & { headers: Headers | Record<string, string | string[] | undefined> }, name: string): string | null {
  const headers = req.headers;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const value = (headers as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

type FeedFailureReason = 'timeout' | 'http-error' | 'decode-error';

type FeedFetchResult =
  | { ok: true; data: any }
  | { ok: false; reason: FeedFailureReason; detail: string };

/** Keep optional enrichment from holding the whole live response until Vercel's timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Frontend already shows the agency name as a heading above this message,
// so these stay agency-agnostic and plain — no jargon, no repeating "live feed".
const FEED_FAILURE_MESSAGES: Record<FeedFailureReason, string> = {
  timeout: "This feed is taking too long to respond.",
  'http-error': "Can't reach this feed right now.",
  'decode-error': "This feed sent back data we can't read.",
};

async function fetchProtoFeed(
  url: string,
  label: string,
  opts?: { apiKeyParam?: string; apiKeyParamName?: string; apiKeyHeader?: string }
): Promise<FeedFetchResult> {
  let finalUrl = url;
  const headers: Record<string, string> = {
    'User-Agent': 'atlas-live-vehicles/1.0 (https://atlas.civicminds.org)',
  };

  if (opts?.apiKeyParam) {
    const paramName = opts.apiKeyParamName ?? 'apikey';
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + `${paramName}=${encodeURIComponent(opts.apiKeyParam)}`;
  }
  if (opts?.apiKeyHeader) {
    headers['apikey'] = opts.apiKeyHeader;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(finalUrl, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[live-vehicles] ${label} feed HTTP ${res.status}: ${url}`);
      return { ok: false, reason: 'http-error', detail: `upstream returned HTTP ${res.status}` };
    }
    const buffer = await res.arrayBuffer();
    try {
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
      const data = GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
        longs: String,
        enums: String,
        bytes: String,
      });
      return { ok: true, data };
    } catch (decodeErr) {
      console.error(`[live-vehicles] ${label} feed failed to decode: ${url}`, decodeErr);
      return { ok: false, reason: 'decode-error', detail: 'upstream returned unreadable data' };
    }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    console.error(`[live-vehicles] ${label} feed ${timedOut ? 'timed out' : 'fetch failed'}: ${url}`, err);
    return {
      ok: false,
      reason: timedOut ? 'timeout' : 'http-error',
      detail: timedOut ? 'upstream timed out' : 'could not reach upstream',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRecentTtcArchive(): Promise<any[] | null> {
  // Short window — this is a short-lived fallback for a vehicle missing from
  // the *current* feed during a refresh, not a historical query.
  const snapshots = await fetchRecentPositions('ttc', 3);
  if (snapshots.length === 0) return null;
  return snapshots.flatMap(s => s.vehicles);
}

async function fetchTtcShapes(): Promise<Map<string, Shape[]>> {
  const shapes = new Map<string, Shape[]>();
  try {
    const res = await fetch(`${R2_PUBLIC_URL}/atlas/ttc.json`);
    if (!res.ok) return shapes;
    const data = await res.json() as { features?: GeoJSON.Feature[] };
    for (const feature of data.features ?? []) {
      const p = feature.properties as Record<string, unknown> | null;
      if (!p?.routeShortName) continue;
      const parts = shapesFromGeometry(feature.geometry as { type: string; coordinates: unknown } | null);
      if (parts.length === 0) continue;
      const key = `${p.routeShortName}::${p.directionId ?? 0}`;
      if (!shapes.has(key)) shapes.set(key, []);
      shapes.get(key)!.push(...parts);
    }
  } catch {
    // Headway status is optional; live positions still render if shapes are unavailable.
  }
  return shapes;
}

export default async function handler(req: Request) {
  const ip = requestHeader(req, 'x-real-ip') ?? requestHeader(req, 'x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
      },
    });
  }

  const agencySlug = queryParams(req).get('agency');

  if (!agencySlug) {
    return new Response(JSON.stringify({ error: 'Agency slug is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const configs = LIVE_POLLING_ROUTES.filter(r => r.slug === agencySlug);
  if (configs.length === 0) {
    return new Response(JSON.stringify({ error: `No live config found for agency: ${agencySlug}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get URLs and keys from the first route configuration for this agency
  const cfg = configs[0];
  const tripUpdatesUrl = cfg.tripUpdatesUrl;
  const vehiclePositionsUrl = cfg.vehiclePositionsUrl;

  const apiKeyParam = cfg.apiKeyParamEnvVar ? process.env[cfg.apiKeyParamEnvVar] : undefined;
  const apiKeyParamName = cfg.apiKeyParamName;
  const apiKeyHeader = cfg.apiKeyHeaderEnvVar ? process.env[cfg.apiKeyHeaderEnvVar] : undefined;

  const fetchOpts = { apiKeyParam, apiKeyParamName, apiKeyHeader };

  try {
    // Fetch positions, trip updates, and static trips lookup in parallel
    const [positionsResult, updatesResult, tripsLookup, liveSidecar, archivedPositions, ttcShapes] = await Promise.all([
      fetchProtoFeed(vehiclePositionsUrl, `${agencySlug} positions`, fetchOpts),
      fetchProtoFeed(tripUpdatesUrl, `${agencySlug} updates`, fetchOpts),
      withTimeout(
        fetch(`${R2_PUBLIC_URL}/atlas/${agencySlug}-trips.json`)
          .then(r => r.ok ? r.json() as Promise<Record<string, { d: number; h: string | null }>> : null)
          .catch(() => null),
        8_000,
        null,
      ),
      withTimeout(
        fetch(`${R2_PUBLIC_URL}/atlas/live-polling/${encodeURIComponent(agencySlug)}.json`)
          .then(r => r.ok ? r.json() as Promise<Record<string, { tripStopTimes?: Record<string, Record<string, number>> }>> : null)
          .catch(() => null),
        8_000,
        null,
      ),
      agencySlug === 'ttc' ? withTimeout(fetchRecentTtcArchive(), 8_000, null) : Promise.resolve(null),
      agencySlug === 'ttc' ? withTimeout(fetchTtcShapes(), 8_000, new Map<string, Shape[]>()) : Promise.resolve(new Map<string, Shape[]>()),
    ]);

    if (!positionsResult.ok) {
      return new Response(
        JSON.stringify({
          error: FEED_FAILURE_MESSAGES[positionsResult.reason],
          reason: positionsResult.reason,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    const positionsFeed = positionsResult.data;

    // Trip updates are optional context (delay/headsign) — a failure here degrades
    // data quality rather than blocking positions, but it shouldn't be silent.
    const degraded = !updatesResult.ok;
    const degradedReason = updatesResult.ok
      ? null
      : "Arrival time and delay info isn't available right now.";
    if (!updatesResult.ok) {
      console.warn(`[live-vehicles] ${agencySlug}: trip updates unavailable (${updatesResult.reason}), continuing with positions only`);
    }
    const updatesFeed = updatesResult.ok ? updatesResult.data : null;

    // Map live routeIds to their display names
    const routeIdToShortName = new Map<string, string>();
    const routeIdToDisplayName = new Map<string, string>();
    const routeTripStopTimes = new Map<string, Record<string, Record<string, number>>>();
    for (const config of configs) {
      for (const rid of config.routeIds) {
        routeIdToShortName.set(rid, config.displayRouteShortName);
        if (config.displayName) {
          routeIdToDisplayName.set(rid, config.displayName);
        }
      }
      const times = liveSidecar?.[config.displayRouteShortName]?.tripStopTimes;
      if (times) routeTripStopTimes.set(config.displayRouteShortName, times);
    }

    const refEpoch = Number(
      positionsFeed.header?.timestamp
      ?? updatesFeed?.header?.timestamp
      ?? Math.floor(Date.now() / 1000),
    );
    const timeZone = LIVE_AGENCY_TIMEZONES[agencySlug] ?? 'America/Toronto';
    const serviceDayStart = serviceDayStartEpoch(refEpoch, timeZone);

    const tripUpdatesById = new Map<string, any>();
    if (updatesFeed?.entity) {
      for (const e of (updatesFeed.entity as any[])) {
        const tu = e.tripUpdate;
        const tId = tu?.trip?.tripId;
        if (tId) tripUpdatesById.set(tId, tu);
      }
    }

    function headsignFromTripUpdate(tu: any): string | undefined {
      let headsign = tu.trip?.tripHeadsign;
      if (!headsign && tu.stopTimeUpdate?.length > 0) {
        const lastUpdate = tu.stopTimeUpdate[tu.stopTimeUpdate.length - 1];
        headsign = lastUpdate.stopHeadsign;
      }
      return headsign;
    }

    function resolveTripDelaySec(tu: any, routeShortName: string, vehicleCtx?: {
      stopId?: string;
      stopSequence?: number;
      currentStatus?: string | number;
    }): number | null {
      const explicit = explicitTripDelaySec(tu);
      if (explicit != null) return explicit;
      const tripStopTimes = routeTripStopTimes.get(routeShortName);
      return delayFromTripUpdate(tu, tripStopTimes, serviceDayStart, vehicleCtx);
    }

    // Extract trip delays and headsigns from Trip Updates feed.
    // Also collect predicted arrival epochs per (route, direction, stop) for observed headways.
    const tripDelays = new Map<string, { delay: number; headsign?: string }>();
    const stopArrivals = new Map<string, number[]>();
    if (updatesFeed?.entity) {
      for (const e of (updatesFeed.entity as any[])) {
        const tu = e.tripUpdate;
        if (!tu) continue;
        const tId = tu.trip?.tripId;
        const routeId = tu.trip?.routeId;
        if (!tId || !routeId) continue;
        const routeShortName = routeIdToShortName.get(routeId);
        if (!routeShortName) continue;

        // Stops are directional (each direction has its own stop ids), so per-stop
        // gaps are direction-clean even though TTC's RT feed carries no directionId.
        const schedRel = tu.trip?.scheduleRelationship;
        if (schedRel !== 'DELETED' && schedRel !== 'CANCELED') {
          for (const stu of tu.stopTimeUpdate ?? []) {
            const t = Number(stu.arrival?.time ?? stu.departure?.time);
            if (!stu.stopId || !Number.isFinite(t) || t <= 0) continue;
            const key = `${routeShortName}::${stu.stopId}`;
            if (!stopArrivals.has(key)) stopArrivals.set(key, []);
            stopArrivals.get(key)!.push(t);
          }
        }

        const delaySec = resolveTripDelaySec(tu, routeShortName);
        if (delaySec == null) continue;

        tripDelays.set(tId, {
          delay: delayMinFromDelaySec(delaySec),
          headsign: headsignFromTripUpdate(tu),
        });
      }
    }

    // Observed headway per route: median gap between successive predicted arrivals
    // across all stops (gaps over 3h are schedule boundaries, not headways)
    const gapsByRoute = new Map<string, number[]>();
    for (const [key, times] of stopArrivals) {
      if (times.length < 2) continue;
      const routeShortName = key.split('::')[0];
      times.sort((a, b) => a - b);
      for (let i = 1; i < times.length; i++) {
        const gapMin = (times[i] - times[i - 1]) / 60;
        if (gapMin <= 0 || gapMin > 180) continue;
        if (!gapsByRoute.has(routeShortName)) gapsByRoute.set(routeShortName, []);
        gapsByRoute.get(routeShortName)!.push(gapMin);
      }
    }
    const headways: Record<string, { gapMin: number; samples: number }> = {};
    for (const [routeShortName, gaps] of gapsByRoute) {
      gaps.sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      headways[routeShortName] = { gapMin: Math.round(median * 10) / 10, samples: gaps.length };
    }

    // Compile active vehicles list
    const vehicles: any[] = [];
    const currentPositionPeers = ((positionsFeed.entity ?? []) as any[]).flatMap(e => {
      const v = e.vehicle;
      const routeId = v?.trip?.routeId;
      const lat = v?.position?.latitude;
      const lon = v?.position?.longitude;
      if (!routeId || lat == null || lon == null || !routeIdToShortName.has(routeId)) return [];
      return [{
        id: v.vehicle?.id || v.trip?.tripId || `${lat}-${lon}`,
        routeId,
        lat: Number(lat),
        lon: Number(lon),
        speedKmh: v.position?.speed != null ? Number(v.position.speed) * 3.6 : null,
        directionId: v.trip?.directionId != null ? Number(v.trip.directionId) : null,
      }];
    });
    if (positionsFeed.entity) {
      for (const e of (positionsFeed.entity as any[])) {
        const vp = e.vehicle;
        if (!vp) continue;
        const routeId = vp.trip?.routeId;
        if (!routeId || !routeIdToShortName.has(routeId)) continue;

        const tripId = vp.trip?.tripId;
        const lat = vp.position?.latitude;
        const lon = vp.position?.longitude;
        if (lat == null || lon == null) continue;

        const routeShortName = routeIdToShortName.get(routeId)!;
        const displayName = routeIdToDisplayName.get(routeId) || '';

        const delayInfo = tripId ? tripDelays.get(tripId) : null;
        let delayMin = delayInfo?.delay ?? null;

        if (delayMin == null && tripId) {
          const tu = tripUpdatesById.get(tripId);
          if (tu) {
            const delaySec = resolveTripDelaySec(tu, routeShortName, {
              stopId: vp.stopId,
              stopSequence: vp.currentStopSequence,
              currentStatus: vp.currentStatus,
            });
            if (delaySec != null) delayMin = delayMinFromDelaySec(delaySec);
          }
        }

        // Prefer real-time headsign; fall back to static trips lookup
        const rtHeadsign = delayInfo?.headsign ?? null;
        const staticTrip = tripId && tripsLookup ? tripsLookup[tripId] : null;
        const headsign = rtHeadsign ?? staticTrip?.h ?? null;

        // Prefer real-time directionId; fall back to static trips lookup
        const rtDirectionId = vp.trip?.directionId != null ? Number(vp.trip.directionId) : null;
        const directionId = rtDirectionId ?? (staticTrip ? staticTrip.d : null);

        let status = 'no_data';
        let statusLabel: string | null = null;
        let headwayGapMin: number | null = null;
        if (agencySlug === 'ttc') {
          const candidates = ttcShapes.get(`${routeShortName}::${directionId ?? 0}`)
            ?? [...ttcShapes.entries()].find(([key]) => key.startsWith(`${routeShortName}::`))?.[1];
          if (candidates && candidates.length > 0) {
            const peers = currentPositionPeers
              .filter(v => v.routeId === routeId)
              .map(v => ({ id: v.id, lat: v.lat, lon: v.lon, speedKmh: v.speedKmh, directionId: v.directionId }));
            // Include the latest archived positions as a short-lived fallback when a
            // vehicle is absent from the current feed during a feed refresh.
            for (const archived of archivedPositions ?? []) {
              if (archived.r !== routeId || currentPositionPeers.some(v => v.id === archived.id)) continue;
              peers.push({ id: archived.id, lat: archived.lat, lon: archived.lon, speedKmh: archived.spd, directionId: null });
            }
            // When a route+direction has multiple shape candidates (branches,
            // diversions, or MultiLineString parts), pick whichever one this
            // vehicle and its peers actually sit closest to.
            const shape = candidates.length === 1
              ? candidates[0]
              : pickBestShape(candidates, s => s, [{ lat: Number(lat), lon: Number(lon) }, ...peers], TTC_SHAPE_MATCH_MAX_DIST_M);
            if (shape) {
              headwayGapMin = vehicleHeadwayGapMinFromShape(
                { id: vp.vehicle?.id || tripId || `${lat}-${lon}`, lat: Number(lat), lon: Number(lon), speedKmh: vp.position?.speed != null ? Number(vp.position.speed) * 3.6 : null, directionId },
                peers,
                shape,
              );
              if (headwayGapMin != null) {
                statusLabel = `${Math.round(headwayGapMin)}m gap`;
                const scheduled = configs.find(c => c.displayRouteShortName === routeShortName)?.scheduledHeadwayMin ?? 10;
                delayMin = Math.round((headwayGapMin - scheduled) * 10) / 10;
              }
            }
          }
        }
        if (delayMin != null) {
          if (delayMin <= -1.5) status = 'early';
          else if (delayMin >= 5.5) status = 'late';
          else status = 'on_time';
        }

        vehicles.push({
          id: vp.vehicle?.id || tripId || `${lat}-${lon}`,
          routeShortName,
          displayName,
          tripId,
          lat: Number(lat),
          lon: Number(lon),
          bearing: vp.position?.bearing != null ? Number(vp.position.bearing) : null,
          // GTFS-RT speed is m/s
          speedKmh: vp.position?.speed != null ? Math.round(Number(vp.position.speed) * 3.6) : null,
          tsEpoch: vp.timestamp != null && Number(vp.timestamp) > 0 ? Number(vp.timestamp) : null,
          delayMin,
          headsign,
          directionId,
          vehicleLabel: vp.vehicle?.label ?? null,
          status,
          statusLabel,
          headwayGapMin,
        });
      }
    }

    return new Response(JSON.stringify({ vehicles, headways, degraded, degradedReason }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=10',
      },
    });
  } catch (err: unknown) {
    console.error(`[live-vehicles] agency=${agencySlug}`, err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
