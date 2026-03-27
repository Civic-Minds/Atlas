/**
 * Ouija ingestion poller.
 *
 * For each configured agency, polls the GTFS-RT vehicle positions feed
 * on a fixed interval and writes every observed position to Postgres.
 * This builds the historical record that OTP analysis runs against.
 */

import { Agency, VehiclePosition } from '../types';
import { insertVehiclePositions, logIngestion } from '../storage/db';
import { ROUTE_FILTER } from '../config';
import { log } from '../logger';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

async function fetchPositions(agency: Agency): Promise<VehiclePosition[]> {
  const res = await fetch(agency.vehiclePositionsUrl, { headers: agency.headers ?? {} });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${agency.vehiclePositionsUrl}`);

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
      observedAt,
    });
  }

  return positions;
}

async function pollAgency(agency: Agency): Promise<void> {
  try {
    const positions = await fetchPositions(agency);
    await insertVehiclePositions(positions);
    await logIngestion(agency.id, true, positions.length);
    log.info('Poll', 'ok', { agency: agency.id, vehicles: positions.length });
  } catch (err) {
    const msg = (err as Error).message;
    await logIngestion(agency.id, false, undefined, msg).catch(() => undefined);
    log.error('Poll', 'failed', { agency: agency.id, err: msg });
  }
}

export function startPolling(agencies: Agency[], intervalMs: number): void {
  log.info('Poller', 'starting', {
    agencies: agencies.map(a => a.id),
    intervalMs,
  });

  // Immediate first poll for each agency, then on interval
  for (const agency of agencies) {
    void pollAgency(agency);
    setInterval(() => void pollAgency(agency), intervalMs);
  }
}
