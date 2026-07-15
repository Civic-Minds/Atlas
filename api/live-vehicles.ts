import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { GeoJSON } from 'geojson';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { LIVE_POLLING_ROUTES, LIVE_AGENCY_TIMEZONES } from '../shared/livePollingConfig.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import {
  delayFromTripUpdate,
  delayMinFromDelaySec,
  explicitTripDelaySec,
  serviceDayStartEpoch,
} from '../shared/liveVehicleDelay.js';
import { isRateLimited } from '../shared/rateLimit.js';
import { vehicleHeadwayGapMin } from '../shared/liveHeadway.js';

export const config = {
  maxDuration: 60,
};

function queryParams(req: Request & { url?: string }): URLSearchParams {
  const raw = req.url ?? '';
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  return new URLSearchParams(qs);
}

async function fetchProtoFeed(
  url: string,
  opts?: { apiKeyParam?: string; apiKeyHeader?: string }
) {
  let finalUrl = url;
  const headers: Record<string, string> = {
    'User-Agent': 'atlas-live-vehicles/1.0 (https://atlas.civicminds.org)',
  };

  if (opts?.apiKeyParam) {
    finalUrl += (finalUrl.includes('?') ? '&' : '?') + `apikey=${encodeURIComponent(opts.apiKeyParam)}`;
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
      console.warn(`Feed fetch failed: HTTP ${res.status} for ${url}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
      longs: String,
      enums: String,
      bytes: String,
    });
  } catch (err) {
    console.error(`Failed to fetch proto feed from ${url}:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function liveArchiveClient(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function fetchRecentTtcArchive(): Promise<any[] | null> {
  const client = liveArchiveClient();
  if (!client) return null;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  try {
    const listed = await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live',
      Prefix: `positions/ttc/${date}/`,
    }));
    const keys = (listed.Contents ?? []).filter(o => o.Key).sort((a, b) => String(b.Key).localeCompare(String(a.Key))).slice(0, 3);
    const snapshots = await Promise.all(keys.map(async ({ Key }) => {
      const object = await client.send(new GetObjectCommand({
        Bucket: process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live',
        Key: Key!,
      }));
      return JSON.parse(await object.Body!.transformToString());
    }));
    return snapshots.flatMap(snapshot => snapshot.vehicles ?? []);
  } catch {
    return null;
  }
}

async function fetchTtcShapes(): Promise<Map<string, GeoJSON.Feature>> {
  const shapes = new Map<string, GeoJSON.Feature>();
  try {
    const res = await fetch(`${R2_PUBLIC_URL}/atlas/ttc.json`);
    if (!res.ok) return shapes;
    const data = await res.json() as { features?: GeoJSON.Feature[] };
    for (const feature of data.features ?? []) {
      const p = feature.properties as Record<string, unknown> | null;
      if (!p?.routeShortName || feature.geometry?.type !== 'LineString') continue;
      const key = `${p.routeShortName}::${p.directionId ?? 0}`;
      const existing = shapes.get(key);
      const length = feature.geometry.coordinates.length;
      if (!existing || length > (existing.geometry as GeoJSON.LineString).coordinates.length) shapes.set(key, feature);
    }
  } catch {
    // Headway status is optional; live positions still render if shapes are unavailable.
  }
  return shapes;
}

export default async function handler(req: Request) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
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
  const apiKeyHeader = cfg.apiKeyHeaderEnvVar ? process.env[cfg.apiKeyHeaderEnvVar] : undefined;

  const fetchOpts = { apiKeyParam, apiKeyHeader };

  try {
    // Fetch positions, trip updates, and static trips lookup in parallel
    const [positionsFeed, updatesFeed, tripsLookup, liveSidecar, archivedPositions, ttcShapes] = await Promise.all([
      fetchProtoFeed(vehiclePositionsUrl, fetchOpts),
      fetchProtoFeed(tripUpdatesUrl, fetchOpts),
      fetch(`${R2_PUBLIC_URL}/atlas/${agencySlug}-trips.json`)
        .then(r => r.ok ? r.json() as Promise<Record<string, { d: number; h: string | null }>> : null)
        .catch(() => null),
      fetch(`${R2_PUBLIC_URL}/atlas/live-polling/${encodeURIComponent(agencySlug)}.json`)
        .then(r => r.ok ? r.json() as Promise<Record<string, { tripStopTimes?: Record<string, Record<string, number>> }>> : null)
        .catch(() => null),
      agencySlug === 'ttc' ? fetchRecentTtcArchive() : Promise.resolve(null),
      agencySlug === 'ttc' ? fetchTtcShapes() : Promise.resolve(new Map<string, GeoJSON.Feature>()),
    ]);

    if (!positionsFeed) {
      return new Response(
        JSON.stringify({ error: `Could not load vehicle positions for agency: ${agencySlug}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

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
          const shapeFeature = ttcShapes.get(`${routeShortName}::${directionId ?? 0}`)
            ?? [...ttcShapes.entries()].find(([key]) => key.startsWith(`${routeShortName}::`))?.[1];
          const shape = shapeFeature?.geometry?.type === 'LineString'
            ? { coordinates: shapeFeature.geometry.coordinates as [number, number][] }
            : null;
          if (shape) {
            const peers = currentPositionPeers
              .filter(v => v.routeId === routeId)
              .map(v => ({ id: v.id, lat: v.lat, lon: v.lon, speedKmh: v.speedKmh, directionId: v.directionId }));
            // Include the latest archived positions as a short-lived fallback when a
            // vehicle is absent from the current feed during a feed refresh.
            for (const archived of archivedPositions ?? []) {
              if (archived.r !== routeId || currentPositionPeers.some(v => v.id === archived.id)) continue;
              peers.push({ id: archived.id, lat: archived.lat, lon: archived.lon, speedKmh: archived.spd, directionId: null });
            }
            headwayGapMin = vehicleHeadwayGapMin(
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

    return new Response(JSON.stringify({ vehicles, headways }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=10',
      },
    });
  } catch (err: unknown) {
    console.error('[live-vehicles]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
