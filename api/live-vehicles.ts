import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { R2_PUBLIC_URL } from '../shared/config.js';

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

export default async function handler(req: Request) {
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
    const [positionsFeed, updatesFeed, tripsLookup] = await Promise.all([
      fetchProtoFeed(vehiclePositionsUrl, fetchOpts),
      fetchProtoFeed(tripUpdatesUrl, fetchOpts),
      fetch(`${R2_PUBLIC_URL}/atlas/${agencySlug}-trips.json`)
        .then(r => r.ok ? r.json() as Promise<Record<string, { d: number; h: string | null }>> : null)
        .catch(() => null),
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
    for (const config of configs) {
      for (const rid of config.routeIds) {
        routeIdToShortName.set(rid, config.displayRouteShortName);
        if (config.displayName) {
          routeIdToDisplayName.set(rid, config.displayName);
        }
      }
    }

    // Extract trip delays and headsigns from Trip Updates feed
    const tripDelays = new Map<string, { delay: number; headsign?: string }>();
    if (updatesFeed?.entity) {
      for (const e of (updatesFeed.entity as any[])) {
        const tu = e.tripUpdate;
        if (!tu) continue;
        const tId = tu.trip?.tripId;
        if (!tId) continue;

        // Try trip-level delay, or first stop_time_update delay
        let delaySec = tu.delay;
        if (delaySec == null && tu.stopTimeUpdate && tu.stopTimeUpdate.length > 0) {
          const firstUpdate = tu.stopTimeUpdate[0];
          const event = firstUpdate.arrival || firstUpdate.departure;
          if (event?.delay != null) {
            delaySec = event.delay;
          }
        }

        const delayMin = delaySec != null ? Math.round(Number(delaySec) / 60 * 10) / 10 : null;

        let headsign = tu.trip?.tripHeadsign;
        if (!headsign && tu.stopTimeUpdate && tu.stopTimeUpdate.length > 0) {
          const lastUpdate = tu.stopTimeUpdate[tu.stopTimeUpdate.length - 1];
          headsign = lastUpdate.stopHeadsign;
        }

        if (delayMin != null) {
          tripDelays.set(tId, { delay: delayMin, headsign });
        }
      }
    }

    // Compile active vehicles list
    const vehicles: any[] = [];
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
        const delayMin = delayInfo?.delay ?? null;

        // Prefer real-time headsign; fall back to static trips lookup
        const rtHeadsign = delayInfo?.headsign ?? null;
        const staticTrip = tripId && tripsLookup ? tripsLookup[tripId] : null;
        const headsign = rtHeadsign ?? staticTrip?.h ?? null;

        // Prefer real-time directionId; fall back to static trips lookup
        const rtDirectionId = vp.trip?.directionId != null ? Number(vp.trip.directionId) : null;
        const directionId = rtDirectionId ?? (staticTrip ? staticTrip.d : null);

        let status = 'no_data';
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
          delayMin,
          headsign,
          directionId,
          vehicleLabel: vp.vehicle?.label ?? null,
          status,
        });
      }
    }

    return new Response(JSON.stringify({ vehicles }), {
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
