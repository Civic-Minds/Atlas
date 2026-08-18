/**
 * atlas-gtfs-rt-archiver
 *
 * Each deployed shard archives its configured vehicle positions every minute
 * to atlas-live/positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json; its
 * TripUpdates feeds are archived every fifth minute, written to:
 *   atlas-live/{slug}/{YYYY-MM-DD}/{unix-seconds}.json
 *
 * Skips writing if the feed is too small to contain active trips (< 5 KB).
 * R2 lifecycle rules enforce the 30-day retention window.
 */

import { LIVE_SNAPSHOT_SCHEMA_VERSION } from '../../../shared/liveContract';
import {
  LIVE_ARCHIVE_SHARDS,
  LIVE_ARCHIVE_POSITION_FEEDS,
  LIVE_ARCHIVE_TRIP_FEEDS,
} from '../../../shared/liveArchiveFeeds';

interface Env {
  BUCKET: R2Bucket;
  ARCHIVE_SHARD: string;
  STM_API_KEY?: string;
}

interface FeedConfig {
  slug: string;
  url: string;
  apiKeyHeader?: keyof Env;
}

// Archive membership + URLs: shared/liveArchiveFeeds.ts (kept in sync with LIVE_POLLING via test).
const FEEDS: FeedConfig[] = LIVE_ARCHIVE_TRIP_FEEDS.map(f => ({
  slug: f.slug,
  url: f.url,
  ...(f.apiKeyHeader ? { apiKeyHeader: f.apiKeyHeader } : {}),
}));

interface PositionFeedConfig {
  slug: string;
  url: string;
  /** Only archive vehicles whose route_id matches (e.g. TTC streetcars). */
  routeFilter: RegExp;
  apiKeyHeader?: keyof Env;
}

// Vehicle positions archived at positions/{slug}/{date}/{ts}.json for live history
const POSITION_FEEDS: PositionFeedConfig[] = LIVE_ARCHIVE_POSITION_FEEDS.map(f => ({
  slug: f.slug,
  url: f.url,
  routeFilter: new RegExp(f.routeFilterSource),
  ...(f.apiKeyHeader ? { apiKeyHeader: f.apiKeyHeader } : {}),
}));

const MIN_FEED_BYTES = 5_000;
const USER_AGENT = 'atlas-gtfs-rt-archiver/1.0 (https://atlas-gamma-two.vercel.app)';

// ---------------------------------------------------------------------------
// Minimal protobuf decoder (no dependencies)
// Handles wire types 0 (varint), 1 (64-bit), 2 (length-delimited), 5 (32-bit)
// ---------------------------------------------------------------------------

function readVarint(buf: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if ((byte & 0x80) === 0) break;
  }
  return [result, pos];
}

const TEXT_DECODER = new TextDecoder();

function str(v: bigint | Uint8Array | undefined): string {
  if (!v || !(v instanceof Uint8Array)) return '';
  return TEXT_DECODER.decode(v);
}

function toInt32(v: bigint | undefined): number | null {
  if (v === undefined) return null;
  return Number(BigInt.asIntN(32, v));
}

interface TripSummary {
  id: string;    // trip_id
  r: string;     // route_id
  d: number | null; // direction_id
  delay: number | null; // seconds late (negative = early)
}

interface ParsedField {
  fieldNum: number;
  varint?: bigint;
  bytes?: Uint8Array;
  nextPos: number;
}

/** Read one field without allocating a Map for every nested protobuf message. */
function readField(buf: Uint8Array, pos: number): ParsedField | null {
  if (pos >= buf.length) return null;

  let tag: bigint;
  [tag, pos] = readVarint(buf, pos);
  const fieldNum = Number(tag >> 3n);
  const wireType = Number(tag & 7n);

  if (wireType === 0) {
    let varint: bigint;
    [varint, pos] = readVarint(buf, pos);
    return { fieldNum, varint, nextPos: pos };
  }

  if (wireType === 1) return { fieldNum, bytes: buf.subarray(pos, pos + 8), nextPos: pos + 8 };

  if (wireType === 2) {
    let len: bigint;
    [len, pos] = readVarint(buf, pos);
    const end = pos + Number(len);
    return { fieldNum, bytes: buf.subarray(pos, end), nextPos: end };
  }

  if (wireType === 5) return { fieldNum, bytes: buf.subarray(pos, pos + 4), nextPos: pos + 4 };
  return null;
}

/**
 * Parse a raw GTFS-RT TripUpdates protobuf and return compact trip summaries.
 *
 * GTFS-RT field map (relevant fields only):
 *   FeedMessage:     entity[]         = field 2
 *   FeedEntity:      trip_update      = field 3
 *   TripUpdate:      trip             = field 1
 *                    stop_time_update = field 2
 *                    delay            = field 5 (int32, trip-level)
 *   TripDescriptor:  trip_id          = field 1
 *                    route_id         = field 5
 *                    direction_id     = field 6
 *   StopTimeUpdate:  arrival          = field 2
 *                    departure        = field 3
 *   StopTimeEvent:   delay            = field 1 (int32, seconds)
 */
export function parseTripUpdates(raw: ArrayBuffer): TripSummary[] {
  const feed = new Uint8Array(raw);
  const trips: TripSummary[] = [];
  let feedPos = 0;

  while (feedPos < feed.length) {
    const entityField = readField(feed, feedPos);
    if (!entityField) break;
    feedPos = entityField.nextPos;
    if (entityField.fieldNum !== 2 || !entityField.bytes) continue;

    const entity = entityField.bytes;
    let entityPos = 0;
    let tuBytes: Uint8Array | undefined;
    while (entityPos < entity.length) {
      const field = readField(entity, entityPos);
      if (!field) break;
      entityPos = field.nextPos;
      if (field.fieldNum === 3 && field.bytes) {
        tuBytes = field.bytes;
        break;
      }
    }
    if (!tuBytes) continue;

    const tu = tuBytes;
    let tuPos = 0;
    let tripBytes: Uint8Array | undefined;
    let firstStopBytes: Uint8Array | undefined;
    let tripDelay: bigint | undefined;
    while (tuPos < tu.length) {
      const field = readField(tu, tuPos);
      if (!field) break;
      tuPos = field.nextPos;
      if (field.fieldNum === 1 && field.bytes) tripBytes = field.bytes;
      else if (field.fieldNum === 2 && field.bytes && !firstStopBytes) firstStopBytes = field.bytes;
      else if (field.fieldNum === 5 && field.varint !== undefined) tripDelay = field.varint;
    }
    if (!tripBytes) continue;

    let tripPos = 0;
    let tripId = '';
    let routeId = '';
    let directionId: number | null = null;
    while (tripPos < tripBytes.length) {
      const field = readField(tripBytes, tripPos);
      if (!field) break;
      tripPos = field.nextPos;
      if (field.fieldNum === 1 && field.bytes) tripId = str(field.bytes);
      else if (field.fieldNum === 5 && field.bytes) routeId = str(field.bytes);
      else if (field.fieldNum === 6 && field.varint !== undefined) directionId = Number(field.varint);
    }
    if (!tripId) continue;

    // Prefer trip-level delay (field 5); fall back to first stop's arrival delay
    let delay = toInt32(tripDelay);

    if (delay === null && firstStopBytes) {
      let stopPos = 0;
      let arrivalBytes: Uint8Array | undefined;
      let departureBytes: Uint8Array | undefined;
      while (stopPos < firstStopBytes.length) {
        const field = readField(firstStopBytes, stopPos);
        if (!field) break;
        stopPos = field.nextPos;
        if (field.fieldNum === 2 && field.bytes) arrivalBytes = field.bytes;
        else if (field.fieldNum === 3 && field.bytes) departureBytes = field.bytes;
      }

      const eventBytes = arrivalBytes ?? departureBytes;
      if (eventBytes) {
        let eventPos = 0;
        while (eventPos < eventBytes.length) {
          const field = readField(eventBytes, eventPos);
          if (!field) break;
          eventPos = field.nextPos;
          if (field.fieldNum === 1 && field.varint !== undefined) {
            delay = toInt32(field.varint);
            break;
          }
        }
      }
    }

    trips.push({ id: tripId, r: routeId, d: directionId, delay });
  }

  return trips;
}

function f32(v: bigint | Uint8Array | undefined): number | null {
  if (!(v instanceof Uint8Array) || v.length !== 4) return null;
  return new DataView(v.buffer, v.byteOffset, 4).getFloat32(0, true);
}

interface VehicleSummary {
  id: string;    // vehicle id
  r: string;     // route_id
  tripId: string;
  d: number | null; // direction_id
  lat: number;
  lon: number;
  spd: number | null; // km/h
  brg: number | null; // bearing
  stopId: string | null;
  stopSequence: number | null;
  currentStatus: number | null;
  t: number | null;   // per-vehicle unix timestamp
}

/**
 * Parse a raw GTFS-RT VehiclePositions protobuf into compact vehicle summaries.
 *
 * GTFS-RT field map (relevant fields only):
 *   FeedEntity:        vehicle    = field 4
 *   VehiclePosition:   trip       = field 1
 *                      position   = field 2
 *                      timestamp  = field 5 (uint64)
 *                      vehicle    = field 8 (VehicleDescriptor)
 *   Position:          latitude   = field 1 (float)
 *                      longitude  = field 2 (float)
 *                      bearing    = field 3 (float)
 *                      speed      = field 5 (float, m/s)
 *   TripDescriptor:    route_id   = field 5
 *   VehicleDescriptor: id         = field 1
 */
export function parseVehiclePositions(raw: ArrayBuffer, routeFilter: RegExp): VehicleSummary[] {
  const feed = new Uint8Array(raw);
  const vehicles: VehicleSummary[] = [];
  let feedPos = 0;

  while (feedPos < feed.length) {
    const entityField = readField(feed, feedPos);
    if (!entityField) break;
    feedPos = entityField.nextPos;
    if (entityField.fieldNum !== 2 || !entityField.bytes) continue;

    const entity = entityField.bytes;
    let entityPos = 0;
    let vpBytes: Uint8Array | undefined;
    while (entityPos < entity.length) {
      const field = readField(entity, entityPos);
      if (!field) break;
      entityPos = field.nextPos;
      if (field.fieldNum === 4 && field.bytes) {
        vpBytes = field.bytes;
        break;
      }
    }
    if (!vpBytes) continue;

    const vp = vpBytes;
    let vpPos = 0;
    let tripBytes: Uint8Array | undefined;
    let posBytes: Uint8Array | undefined;
    let timestamp: bigint | undefined;
    let stopSequence: bigint | undefined;
    let currentStatus: bigint | undefined;
    let stopIdBytes: Uint8Array | undefined;
    let vehicleBytes: Uint8Array | undefined;
    while (vpPos < vp.length) {
      const field = readField(vp, vpPos);
      if (!field) break;
      vpPos = field.nextPos;
      if (field.fieldNum === 1 && field.bytes) tripBytes = field.bytes;
      else if (field.fieldNum === 2 && field.bytes) posBytes = field.bytes;
      else if (field.fieldNum === 3 && field.varint !== undefined) stopSequence = field.varint;
      else if (field.fieldNum === 4 && field.varint !== undefined) currentStatus = field.varint;
      else if (field.fieldNum === 5 && field.varint !== undefined) timestamp = field.varint;
      else if (field.fieldNum === 6 && field.bytes) stopIdBytes = field.bytes;
      else if (field.fieldNum === 8 && field.bytes) vehicleBytes = field.bytes;
    }
    if (!tripBytes || !posBytes) continue;

    let tripPos = 0;
    let tripId = '';
    let routeId = '';
    let directionId: number | null = null;
    while (tripPos < tripBytes.length) {
      const field = readField(tripBytes, tripPos);
      if (!field) break;
      tripPos = field.nextPos;
      if (field.fieldNum === 1 && field.bytes) tripId = str(field.bytes);
      else if (field.fieldNum === 5 && field.bytes) routeId = str(field.bytes);
      else if (field.fieldNum === 6 && field.varint !== undefined) directionId = Number(field.varint);
    }
    if (!routeFilter.test(routeId)) continue;

    let posPos = 0;
    let latBytes: Uint8Array | undefined;
    let lonBytes: Uint8Array | undefined;
    let bearingBytes: Uint8Array | undefined;
    let speedBytes: Uint8Array | undefined;
    while (posPos < posBytes.length) {
      const field = readField(posBytes, posPos);
      if (!field) break;
      posPos = field.nextPos;
      if (field.fieldNum === 1 && field.bytes) latBytes = field.bytes;
      else if (field.fieldNum === 2 && field.bytes) lonBytes = field.bytes;
      else if (field.fieldNum === 3 && field.bytes) bearingBytes = field.bytes;
      else if (field.fieldNum === 5 && field.bytes) speedBytes = field.bytes;
    }

    const lat = f32(latBytes);
    const lon = f32(lonBytes);
    if (lat == null || lon == null) continue;

    const speedMs = f32(speedBytes);
    const bearing = f32(bearingBytes);
    let vehicleId = '';
    if (vehicleBytes) {
      let vehiclePos = 0;
      while (vehiclePos < vehicleBytes.length) {
        const field = readField(vehicleBytes, vehiclePos);
        if (!field) break;
        vehiclePos = field.nextPos;
        if (field.fieldNum === 1 && field.bytes) {
          vehicleId = str(field.bytes);
          break;
        }
      }
    }

    vehicles.push({
      id: vehicleId,
      r: routeId,
      tripId,
      d: directionId,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      spd: speedMs != null ? Math.round(speedMs * 3.6 * 10) / 10 : null,
      brg: bearing != null ? Math.round(bearing) : null,
      stopId: stopIdBytes ? str(stopIdBytes) || null : null,
      stopSequence: toInt32(stopSequence),
      currentStatus: toInt32(currentStatus),
      t: timestamp === undefined ? null : Number(timestamp),
    });
  }

  return vehicles;
}

function headersFor(apiKeyHeader: keyof Env | undefined, env: Env): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  if (apiKeyHeader) {
    const key = env[apiKeyHeader] as string | undefined;
    if (key) headers.apikey = key;
  }
  return headers;
}

async function archivePositions(
  feed: PositionFeedConfig,
  env: Env,
  date: string,
  ts: number,
): Promise<string> {
  const res = await fetch(feed.url, {
    headers: headersFor(feed.apiKeyHeader, env),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`positions/${feed.slug}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();

  const vehicles = parseVehiclePositions(buf, feed.routeFilter);
  if (vehicles.length === 0) return `positions/${feed.slug}: skipped (0 matching vehicles)`;

  const payload = JSON.stringify({
    schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
    agency: feed.slug,
    feedType: 'vehicle_positions',
    capturedAt: ts,
    sourceTimestamp: vehicles.reduce<number | null>((latest, vehicle) =>
      vehicle.t == null ? latest : Math.max(latest ?? 0, vehicle.t), null),
    records: vehicles,
    // Keep the legacy field during the canary migration window.
    ts,
    vehicles,
  });
  const key = `positions/${feed.slug}/${date}/${ts}.json`;
  await env.BUCKET.put(key, payload, {
    httpMetadata: { contentType: 'application/json' },
  });
  return `positions/${feed.slug}: ${vehicles.length} vehicles → ${key} (${payload.length} B)`;
}

async function archiveTrips(
  feed: FeedConfig,
  env: Env,
  date: string,
  ts: number,
): Promise<string> {
  const res = await fetch(feed.url, {
    headers: headersFor(feed.apiKeyHeader, env),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${feed.slug}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();

  if (buf.byteLength < MIN_FEED_BYTES) {
    return `${feed.slug}: skipped (${buf.byteLength} B — feed idle)`;
  }

  const trips = parseTripUpdates(buf);
  if (trips.length === 0) return `${feed.slug}: skipped (0 trips parsed)`;

  const payload = JSON.stringify({
    schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
    agency: feed.slug,
    feedType: 'trip_updates',
    capturedAt: ts,
    sourceTimestamp: null,
    records: trips,
    // Keep the legacy field during the canary migration window.
    ts,
    trips,
  });
  const key = `${feed.slug}/${date}/${ts}.json`;
  await env.BUCKET.put(key, payload, {
    httpMetadata: { contentType: 'application/json' },
  });
  return `${feed.slug}: ${trips.length} trips → ${key} (${payload.length} B)`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default {
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const shard = LIVE_ARCHIVE_SHARDS.find(candidate => candidate.id === env.ARCHIVE_SHARD);
    if (!shard) {
      console.error(`unknown archive shard: ${env.ARCHIVE_SHARD}`);
      return;
    }

    const now = new Date(event.scheduledTime);
    const date = now.toISOString().slice(0, 10);
    const ts = Math.floor(now.getTime() / 1000);
    const positionFeeds = shard.positionSlugs
      .map(slug => POSITION_FEEDS.find(feed => feed.slug === slug))
      .filter((feed): feed is PositionFeedConfig => feed !== undefined);
    const tripFeeds = shard.tripSlugs
      .map(slug => FEEDS.find(feed => feed.slug === slug))
      .filter((feed): feed is FeedConfig => feed !== undefined);

    const positionResult = await Promise.allSettled([
      ...positionFeeds.map(feed => archivePositions(feed, env, date, ts)),
    ]);

    // All shards fire every minute; trip updates keep the original 5-minute cadence.
    const tripResults = now.getUTCMinutes() % 5 === 0
      ? await Promise.allSettled(tripFeeds.map(feed => archiveTrips(feed, env, date, ts)))
      : [];

    for (const result of [...tripResults, ...positionResult]) {
      if (result.status === 'fulfilled') console.log(result.value);
      else console.error(result.reason);
    }
  },
};
