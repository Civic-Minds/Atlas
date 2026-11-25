/**
 * CIV-2939 (Ryan, 2026-11-25, "1": "save the whole-network vehicle count each minute for every recorded agency, TTC
 * included, and Fleet shows it as 'In service now'"; then a second Fleet row, "Not on a trip"). The cloud recorder counts
 * the vehicles in an agency's whole positions feed, before any route filter, and stores the two numbers in the snapshot
 * it already writes (LiveSnapshotV2.network): no separate file and no extra write. A vehicle is "on a trip" when its
 * position names a trip (trip_id or route_id); the TTC sends about 13% of its vehicles with none (Studio 2, 2026-11-25).
 * The atlas-live-read Worker serves the latest (/live/network-count).
 */
import type { LiveSnapshotV2 } from './liveContract';

type Positions = { entity?: readonly { vehicle?: { position?: unknown; trip?: { tripId?: string | null; routeId?: string | null } | null } | null }[] | null };

/** Vehicles with a position in a decoded positions feed (gtfs-realtime-bindings toObject): on a trip, and not on one. */
export function networkVehicleCounts(positions: Positions): { onTrip: number; noTrip: number } {
  let onTrip = 0, noTrip = 0;
  for (const e of positions.entity ?? []) {
    if (e.vehicle?.position == null) continue;
    if (e.vehicle.trip?.tripId || e.vehicle.trip?.routeId) onTrip++;
    else noTrip++;
  }
  return { onTrip, noTrip };
}

/** The /live/network-count answer from a snapshot, or null when it has no counts (written before they existed). */
export function networkCountAnswer(snap: LiveSnapshotV2 | null, nowSec: number): { agency: string; at: number; vehicles: number; noTrip: number; ageSec: number } | null {
  if (!snap?.network) return null;
  return { agency: snap.agency, at: snap.capturedAt, vehicles: snap.network.onTrip, noTrip: snap.network.noTrip, ageSec: Math.max(0, nowSec - snap.capturedAt) };
}
