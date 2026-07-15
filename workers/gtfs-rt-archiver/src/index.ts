/**
 * atlas-gtfs-rt-archiver
 *
 * Runs every minute. Vehicle positions (POSITION_FEEDS) are archived each run
 * to atlas-live/positions/{slug}/{YYYY-MM-DD}/{unix-seconds}.json; TripUpdates
 * trip-delay summaries (FEEDS) self-gate to every 5th minute, written to:
 *   atlas-live/{slug}/{YYYY-MM-DD}/{unix-seconds}.json
 *
 * Skips writing if the feed is too small to contain active trips (< 5 KB).
 *
 * Also runs a daily cleanup at 04:00 UTC to delete data older than 30 days.
 */

import { LIVE_SNAPSHOT_SCHEMA_VERSION } from '../../../shared/liveContract';

interface Env {
  BUCKET: R2Bucket;
  STM_API_KEY?: string;
}

interface FeedConfig {
  slug: string;
  url: string;
  apiKeyHeader?: keyof Env;
}

const FEEDS: FeedConfig[] = [
  { slug: 'ttc',        url: 'https://gtfsrt.ttc.ca/trips/update?format=binary' },
  { slug: 'burlington', url: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb' },
  { slug: 'hamilton',   url: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb' },
  { slug: 'stm',        url: 'https://api.stm.info/pub/od/gtfs-rt/ic/v2/tripUpdates', apiKeyHeader: 'STM_API_KEY' },
];

interface PositionFeedConfig {
  slug: string;
  url: string;
  /** Only archive vehicles whose route_id matches (e.g. TTC streetcars). */
  routeFilter: RegExp;
}

// Vehicle positions archived at positions/{slug}/{date}/{ts}.json for speed analysis
const POSITION_FEEDS: PositionFeedConfig[] = [
  { slug: 'ttc', url: 'https://gtfsrt.ttc.ca/vehicles/position?format=binary', routeFilter: /^5(0[1345679]|1[012])$/ },
];

const MIN_FEED_BYTES = 5_000;
const RETENTION_DAYS = 30;
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

function parseMsg(buf: Uint8Array): Map<number, (bigint | Uint8Array)[]> {
  const fields = new Map<number, (bigint | Uint8Array)[]>();
  let pos = 0;
  while (pos < buf.length) {
    let tag: bigint;
    [tag, pos] = readVarint(buf, pos);
    const fieldNum = Number(tag >> 3n);
    const wireType = Number(tag & 7n);
    if (!fields.has(fieldNum)) fields.set(fieldNum, []);
    if (wireType === 0) {
      let v: bigint;
      [v, pos] = readVarint(buf, pos);
      fields.get(fieldNum)!.push(v);
    } else if (wireType === 2) {
      let len: bigint;
      [len, pos] = readVarint(buf, pos);
      const end = pos + Number(len);
      fields.get(fieldNum)!.push(buf.slice(pos, end));
      pos = end;
    } else if (wireType === 1) {
      fields.get(fieldNum)!.push(buf.slice(pos, pos + 8));
      pos += 8;
    } else if (wireType === 5) {
      fields.get(fieldNum)!.push(buf.slice(pos, pos + 4));
      pos += 4;
    } else {
      break;
    }
  }
  return fields;
}

function str(v: bigint | Uint8Array | undefined): string {
  if (!v || !(v instanceof Uint8Array)) return '';
  return new TextDecoder().decode(v);
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
function parseTripUpdates(raw: ArrayBuffer): TripSummary[] {
  const feed = parseMsg(new Uint8Array(raw));
  const entities = feed.get(2) ?? [];
  const trips: TripSummary[] = [];

  for (const entityBytes of entities) {
    if (!(entityBytes instanceof Uint8Array)) continue;
    const entity = parseMsg(entityBytes);

    const tuBytes = entity.get(3)?.[0];
    if (!(tuBytes instanceof Uint8Array)) continue;
    const tu = parseMsg(tuBytes);

    const tripBytes = tu.get(1)?.[0];
    if (!(tripBytes instanceof Uint8Array)) continue;
    const td = parseMsg(tripBytes);

    const tripId = str(td.get(1)?.[0]);
    if (!tripId) continue;

    const routeId = str(td.get(5)?.[0]);
    const directionIdValue = td.get(6)?.[0];
    const directionId = directionIdValue === undefined ? null : Number(directionIdValue);

    // Prefer trip-level delay (field 5); fall back to first stop's arrival delay
    let delay = toInt32(tu.get(5)?.[0] as bigint | undefined);

    if (delay === null) {
      const stuBytes = tu.get(2)?.[0];
      if (stuBytes instanceof Uint8Array) {
        const stu = parseMsg(stuBytes);
        const evtBytes = stu.get(2)?.[0] ?? stu.get(3)?.[0]; // arrival first, then departure
        if (evtBytes instanceof Uint8Array) {
          delay = toInt32(parseMsg(evtBytes).get(1)?.[0] as bigint | undefined);
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
  const feed = parseMsg(new Uint8Array(raw));
  const entities = feed.get(2) ?? [];
  const vehicles: VehicleSummary[] = [];

  for (const entityBytes of entities) {
    if (!(entityBytes instanceof Uint8Array)) continue;
    const entity = parseMsg(entityBytes);

    const vpBytes = entity.get(4)?.[0];
    if (!(vpBytes instanceof Uint8Array)) continue;
    const vp = parseMsg(vpBytes);

    const tripBytes = vp.get(1)?.[0];
    if (!(tripBytes instanceof Uint8Array)) continue;
    const trip = parseMsg(tripBytes);
    const tripId = str(trip.get(1)?.[0]);
    const routeId = str(trip.get(5)?.[0]);
    if (!routeFilter.test(routeId)) continue;

    const posBytes = vp.get(2)?.[0];
    if (!(posBytes instanceof Uint8Array)) continue;
    const pos = parseMsg(posBytes);
    const lat = f32(pos.get(1)?.[0]);
    const lon = f32(pos.get(2)?.[0]);
    if (lat == null || lon == null) continue;

    const speedMs = f32(pos.get(5)?.[0]);
    const bearing = f32(pos.get(3)?.[0]);
    const ts = vp.get(5)?.[0];
    const stopSequence = toInt32(vp.get(3)?.[0] as bigint | undefined);
    const currentStatus = toInt32(vp.get(4)?.[0] as bigint | undefined);
    const stopId = str(vp.get(6)?.[0]) || null;
    const directionIdValue = trip.get(6)?.[0];
    const vdBytes = vp.get(8)?.[0];
    const vehicleId = vdBytes instanceof Uint8Array ? str(parseMsg(vdBytes).get(1)?.[0]) : '';

    vehicles.push({
      id: vehicleId,
      r: routeId,
      tripId,
      d: directionIdValue === undefined ? null : Number(directionIdValue),
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      spd: speedMs != null ? Math.round(speedMs * 3.6 * 10) / 10 : null,
      brg: bearing != null ? Math.round(bearing) : null,
      stopId,
      stopSequence,
      currentStatus,
      t: typeof ts === 'bigint' ? Number(ts) : null,
    });
  }

  return vehicles;
}

// ---------------------------------------------------------------------------
// Retention cleanup — deletes date folders older than RETENTION_DAYS
// ---------------------------------------------------------------------------

async function cleanup(bucket: R2Bucket): Promise<void> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const basePrefixes = [
    ...FEEDS.map(f => `${f.slug}/`),
    ...POSITION_FEEDS.map(f => `positions/${f.slug}/`),
  ];
  for (const basePrefix of basePrefixes) {
    const toDelete: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await bucket.list({ prefix: basePrefix, delimiter: '/', cursor });
      for (const prefix of page.delimitedPrefixes ?? []) {
        const date = prefix.replace(basePrefix, '').replace('/', '');
        if (date && date < cutoffDate) {
          let dateCursor: string | undefined;
          do {
            const objs = await bucket.list({ prefix, cursor: dateCursor });
            for (const obj of objs.objects) toDelete.push(obj.key);
            dateCursor = objs.truncated ? objs.cursor : undefined;
          } while (dateCursor);
        }
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    if (toDelete.length > 0) {
      await bucket.delete(toDelete);
      console.log(`cleanup: deleted ${toDelete.length} objects under ${basePrefix} (before ${cutoffDate})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 4 * * *') {
      ctx.waitUntil(cleanup(env.BUCKET));
      return;
    }

    const now = new Date(event.scheduledTime);
    const date = now.toISOString().slice(0, 10);
    const ts = Math.floor(now.getTime() / 1000);

    const positionResults = await Promise.allSettled(
      POSITION_FEEDS.map(async ({ slug, url, routeFilter }) => {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`positions/${slug}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();

        const vehicles = parseVehiclePositions(buf, routeFilter);
        if (vehicles.length === 0) {
          return `positions/${slug}: skipped (0 matching vehicles)`;
        }

        const payload = JSON.stringify({
          schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
          agency: slug,
          feedType: 'vehicle_positions',
          capturedAt: ts,
          sourceTimestamp: vehicles.reduce<number | null>((latest, vehicle) =>
            vehicle.t == null ? latest : Math.max(latest ?? 0, vehicle.t), null),
          records: vehicles,
          // Keep the legacy field during the canary migration window.
          ts,
          vehicles,
        });
        const key = `positions/${slug}/${date}/${ts}.json`;
        await env.BUCKET.put(key, payload, {
          httpMetadata: { contentType: 'application/json' },
        });
        return `positions/${slug}: ${vehicles.length} vehicles → ${key} (${payload.length} B)`;
      }),
    );

    // Trip delays keep the original 5-minute cadence; positions run every minute
    const results = now.getUTCMinutes() % 5 !== 0 ? [] : await Promise.allSettled(
      FEEDS.map(async ({ slug, url, apiKeyHeader }) => {
        const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
        if (apiKeyHeader) {
          const key = env[apiKeyHeader] as string | undefined;
          if (key) headers['apikey'] = key;
        }
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();

        if (buf.byteLength < MIN_FEED_BYTES) {
          return `${slug}: skipped (${buf.byteLength} B — feed idle)`;
        }

        const trips = parseTripUpdates(buf);
        if (trips.length === 0) {
          return `${slug}: skipped (0 trips parsed)`;
        }

        const payload = JSON.stringify({
          schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
          agency: slug,
          feedType: 'trip_updates',
          capturedAt: ts,
          sourceTimestamp: null,
          records: trips,
          // Keep the legacy field during the canary migration window.
          ts,
          trips,
        });
        const key = `${slug}/${date}/${ts}.json`;
        await env.BUCKET.put(key, payload, {
          httpMetadata: { contentType: 'application/json' },
        });
        return `${slug}: ${trips.length} trips → ${key} (${payload.length} B)`;
      }),
    );

    for (const r of [...results, ...positionResults]) {
      if (r.status === 'fulfilled') console.log(r.value);
      else console.error(r.reason);
    }
  },
};
