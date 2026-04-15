/**
 * Atlas NextGen ingestion poller.
 *
 * For each configured agency, polls the GTFS-RT vehicle positions feed
 * on a fixed interval and writes every observed position to Postgres.
 * This builds the historical record that OTP analysis runs against.
 */

import { Agency, VehiclePosition } from '../types';
import { logIngestion } from '../storage/db';
import { pushToProcessingQueue } from '../queues/position-queue';
import { ROUTE_FILTER } from '../config';
import { log } from '../logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

async function fetchPositions(agency: Agency): Promise<VehiclePosition[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(agency.vehiclePositionsUrl, { headers: agency.headers ?? {}, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res!.ok) throw new Error(`HTTP ${res!.status} from ${agency.vehiclePositionsUrl}`);

  const buf  = await res.arrayBuffer();
  const RT   = (GtfsRealtimeBindings as { transit_realtime: any }).transit_realtime;
  const feed = RT.FeedMessage.decode(new Uint8Array(buf));

  const positions: VehiclePosition[] = [];
  const observedAt = new Date();
  const allowedRoutes = ROUTE_FILTER[agency.id] ?? null;

  for (const entity of feed.entity) {
    const v = entity.vehicle;
    if (!v?.position) continue;

    const routeId = v.trip?.routeId ?? '';
    if (allowedRoutes && !allowedRoutes.includes(routeId)) continue;

    positions.push({
      agencyId:      agency.id,
      vehicleId:     v.vehicle?.id ?? entity.id,
      tripId:        v.trip?.tripId ?? '',
      routeId:       v.trip?.routeId ?? '',
      lat:           v.position.latitude,
      lon:           v.position.longitude,
      speed:         v.position.speed   ?? null,
      bearing:       v.position.bearing ?? null,
      stopId:        v.stopId           ?? null,
      stopSequence:  v.currentStopSequence ?? null,
      currentStatus: v.currentStatus    ?? null,
      delaySeconds:  null,
      matchConfidence: null,
      observedAt,
    });
  }

  return positions;
}

async function pollAgency(agency: Agency): Promise<void> {
  try {
    const rawPositions = await fetchPositions(agency);
    
    // Asynchronous Hand-off: Just push to Redis queue
    await pushToProcessingQueue(agency, rawPositions);
    
    log.info('Poll', 'queued', { agency: agency.id, vehicles: rawPositions.length });
  } catch (err) {
    const msg = (err as Error).message;
    await logIngestion(agency.id, false, undefined, msg).catch(() => undefined);
    log.error('Poll', 'failed', { agency: agency.id, err: msg });
  }
}

export function startPolling(agencies: Agency[], defaultIntervalMs: number): void {
  log.info('Poller', 'starting', {
    agencies: agencies.map(a => a.id),
    defaultIntervalMs,
  });

  // Start each agency's poller with a staggered delay to prevent bursts.
  // 511.org agencies (muni, actransit, vta) share one rate-limited API key,
  // so add up to 30s of random jitter to spread their startup polls.
  agencies.forEach((agency, index) => {
    const interval = agency.pollingIntervalMs ?? defaultIntervalMs;
    const is511Agency = agency.vehiclePositionsUrl.includes('api.511.org');
    const jitterMs = is511Agency ? Math.floor(Math.random() * 30000) : 0;
    const staggeredStartDelay = index * 500 + jitterMs; // 500ms base stagger + optional jitter

    setTimeout(() => {
      // First immediate poll
      void pollAgency(agency);

      // Subsequent recurring polls
      setInterval(() => void pollAgency(agency), interval);

      log.info('Poller', 'initialized', { agency: agency.id, intervalMs: interval, delayedStartMs: staggeredStartDelay, ...(agency.limit ? { rateLimit: agency.limit.notes } : {}) });
    }, staggeredStartDelay);
  });
}
