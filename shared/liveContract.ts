/**
 * Versioned provider contract for Atlas live GTFS-RT snapshots.
 *
 * The contract is intentionally source-oriented. Atlas publishes normalized
 * transit observations; products such as Bridge derive their own operational
 * decisions from them.
 */
export const LIVE_SNAPSHOT_SCHEMA_VERSION = 'atlas.live.v1';

export type LiveFeedType = 'vehicle_positions' | 'trip_updates';

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

export interface LiveTripSnapshot {
  tripId: string;
  routeId: string;
  directionId: number | null;
  delaySeconds: number | null;
}

export interface LiveSnapshotEnvelope<T> {
  schemaVersion: typeof LIVE_SNAPSHOT_SCHEMA_VERSION;
  agency: string;
  feedType: LiveFeedType;
  capturedAt: number;
  sourceTimestamp: number | null;
  records: T[];
}
