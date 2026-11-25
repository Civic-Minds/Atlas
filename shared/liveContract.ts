import type { LiveHeadways, LiveRecord } from './liveJoin.js';

/**
 * Versioned provider contract for Atlas live GTFS-RT snapshots.
 *
 * The contract is intentionally source-oriented. Atlas publishes normalized
 * transit observations; products such as Bridge derive their own operational
 * decisions from them.
 */
export const LIVE_SNAPSHOT_SCHEMA_VERSION = 'atlas.live.v1';

export type LiveFeedType = 'vehicle_positions' | 'trip_updates';

/** @public Unused in code; kept for review as part of the snapshot contract (CIV-1776). */
export interface LiveVehicleSnapshot {
  id: string;
  routeId: string;
  tripId: string;
  directionId: number | null;
  lat: number;
  lon: number;
  speedKmh: number | null;
  bearing: number | null;
  stopId: string | null;
  stopSequence: number | null;
  currentStatus: number | null;
  reportedAt: number | null;
}

/** @public Unused in code; kept for review as part of the snapshot contract (CIV-1776). */
export interface LiveTripSnapshot {
  tripId: string;
  routeId: string;
  directionId: number | null;
  delaySeconds: number | null;
}

/** @public Unused in code; kept for review as part of the snapshot contract (CIV-1776). */
export interface LiveSnapshotEnvelope<T> {
  schemaVersion: typeof LIVE_SNAPSHOT_SCHEMA_VERSION;
  agency: string;
  feedType: LiveFeedType;
  capturedAt: number;
  sourceTimestamp: number | null;
  records: T[];
}

/** CIV-2073: the cloud recorder's snapshot, one per agency per pace slot (shared/liveSlots.ts liveSlotKey), gzip-stored. */
export const LIVE_SNAPSHOT_V2_SCHEMA_VERSION = 'atlas.live.v2';

export interface LiveSnapshotV2 {
  schemaVersion: typeof LIVE_SNAPSHOT_V2_SCHEMA_VERSION;
  agency: string;
  /** The pace slot (unix seconds) the snapshot was taken for: its key time. */
  capturedAt: number;
  /** The positions feed's header time, and the trip-updates feed's (null when not read). */
  sourceTimestamp: number | null;
  tripsTimestamp: number | null;
  paceSec: number;
  /** Whether trip updates were read (false for a positions-only agency or a failed trip feed): Live shows it as degraded. */
  tripsOk: boolean;
  /** Observed headways by Live's route short name where Live names the route, else by route_id. */
  headways: LiveHeadways;
  records: LiveRecord[];
  /** CIV-2939: the agency's whole feed, before the route filter: vehicles on a trip, and with a position but no trip. Absent in older snapshots. */
  network?: { onTrip: number; noTrip: number };
}
