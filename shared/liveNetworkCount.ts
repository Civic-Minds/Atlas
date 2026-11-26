/**
 * CIV-2939 (Ryan, 2026-11-25, "1": "save the whole-network vehicle count each minute for every recorded agency, TTC
 * included, and Fleet shows it as 'In service now'"; then a second Fleet row, "Not on a trip"). The cloud recorder counts
 * the vehicles in an agency's whole positions feed, before any route filter, and stores the two numbers in the snapshot
 * it already writes (LiveSnapshotV2.network): no separate file and no extra write. A vehicle is "on a trip" when its
 * position names a trip (trip_id or route_id); the TTC sends about 13% of its vehicles with none (Studio 2, 2026-11-25).
 * The atlas-live-read Worker serves the latest (/live/network-count).
 */
import type { LiveSnapshotV2 } from './liveContract';
import { GARAGE_MIN_VEHICLES, GARAGE_RADIUS_M, GARAGE_STANDING_SPEED_MS } from './rules/live';

/** How old a count can be: every snapshot carries one, and every recorded agency snapshots at least once a minute. */
export const LIVE_COUNT_STEP_SEC = 60;

type Position = { latitude?: number | null; longitude?: number | null; speed?: number | null };
type Positions = { entity?: readonly { vehicle?: { position?: Position | null; trip?: { tripId?: string | null; routeId?: string | null } | null } | null }[] | null };

/** Vehicles with a position in a decoded positions feed (gtfs-realtime-bindings toObject): on a trip, and not on one. */
export function networkVehicleCounts(positions: Positions): { onTrip: number; noTrip: number; atGarage: number } {
  let onTrip = 0, noTrip = 0;
  const standing: { lat: number; lon: number }[] = [];
  for (const e of positions.entity ?? []) {
    const p = e.vehicle?.position;
    if (p == null) continue;
    if (e.vehicle!.trip?.tripId || e.vehicle!.trip?.routeId) { onTrip++; continue; }
    noTrip++;
    if (typeof p.latitude === 'number' && typeof p.longitude === 'number' && !((p.speed ?? 0) >= GARAGE_STANDING_SPEED_MS)) standing.push({ lat: p.latitude, lon: p.longitude });
  }
  return { onTrip, noTrip, atGarage: atGarageCount(standing) };
}

/**
 * CIV-2990: how many standing vehicles with no trip are at a garage: at least GARAGE_MIN_VEHICLES of them, itself included,
 * within GARAGE_RADIUS_M (shared/rules/live.ts). Grid cells one radius wide, so each vehicle checks only its 3×3 block.
 */
export function atGarageCount(standing: readonly { lat: number; lon: number }[]): number {
  const M_PER_DEG = 111_320;
  const cellOf = (v: { lat: number; lon: number }) => {
    const x = Math.floor((v.lon * M_PER_DEG * Math.cos((v.lat * Math.PI) / 180)) / GARAGE_RADIUS_M);
    const y = Math.floor((v.lat * M_PER_DEG) / GARAGE_RADIUS_M);
    return [x, y] as const;
  };
  const grid = new Map<string, { lat: number; lon: number }[]>();
  for (const v of standing) { const [x, y] = cellOf(v); const k = `${x},${y}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(v); }
  let count = 0;
  for (const v of standing) {
    const [x, y] = cellOf(v);
    let near = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const w of grid.get(`${x + dx},${y + dy}`) ?? []) {
        const mx = (w.lon - v.lon) * M_PER_DEG * Math.cos((v.lat * Math.PI) / 180), my = (w.lat - v.lat) * M_PER_DEG;
        if (mx * mx + my * my <= GARAGE_RADIUS_M * GARAGE_RADIUS_M) near++;
      }
    }
    if (near >= GARAGE_MIN_VEHICLES) count++;
  }
  return count;
}

/** The /live/network-count answer from a snapshot, or null when it has no counts (written before they existed). */
export function networkCountAnswer(snap: LiveSnapshotV2 | null, nowSec: number): { agency: string; at: number; vehicles: number; noTrip: number; atGarage?: number; ageSec: number } | null {
  if (!snap?.network) return null;
  return { agency: snap.agency, at: snap.capturedAt, vehicles: snap.network.onTrip, noTrip: snap.network.noTrip, ...(snap.network.atGarage != null ? { atGarage: snap.network.atGarage } : {}), ageSec: Math.max(0, nowSec - snap.capturedAt) };
}
