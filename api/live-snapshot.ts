import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { LIVE_SNAPSHOT_SCHEMA_VERSION, type LiveFeedType } from '../shared/liveContract.js';
import { isRateLimited } from '../shared/rateLimit.js';

export const config = { maxDuration: 30 };

const BUCKET = process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live';

function queryParams(req: Request & { url?: string }): URLSearchParams {
  const raw = req.url ?? '';
  return new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '');
}

function getR2Client(): S3Client {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('Live snapshot storage is not configured');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function prefixFor(feedType: LiveFeedType, agency: string, date: string): string {
  return feedType === 'vehicle_positions'
    ? `positions/${agency}/${date}/`
    : `${agency}/${date}/`;
}

async function latestKey(client: S3Client, feedType: LiveFeedType, agency: string): Promise<string | null> {
  const dates = [new Date(), new Date(Date.now() - 24 * 60 * 60 * 1000)];
  const keys: string[] = [];
  for (const date of dates) {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefixFor(feedType, agency, dateString(date)),
    }));
    for (const object of result.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
  }
  keys.sort((a, b) => b.localeCompare(a));
  return keys[0] ?? null;
}

function statusForAge(ageSeconds: number): 'fresh' | 'degraded' | 'stale' | 'unavailable' {
  if (ageSeconds <= 90) return 'fresh';
  if (ageSeconds <= 300) return 'degraded';
  if (ageSeconds <= 900) return 'stale';
  return 'unavailable';
}

function normalizeSnapshot(raw: any, feedType: LiveFeedType, agency: string, key: string) {
  const capturedAt = Number(raw.capturedAt ?? raw.ts ?? key.match(/(\d{10})\.json$/)?.[1] ?? 0);
  const records = raw.records ?? (feedType === 'vehicle_positions'
    ? (raw.vehicles ?? []).map((v: any) => ({
        id: v.id ?? '', routeId: v.r ?? '', tripId: v.tripId ?? '', directionId: v.d ?? null,
        lat: v.lat, lon: v.lon, speedKmh: v.spd ?? null, bearing: v.brg ?? null,
        stopId: v.stopId ?? null, stopSequence: v.stopSequence ?? null,
        currentStatus: v.currentStatus ?? null, reportedAt: v.t ?? null,
      }))
    : (raw.trips ?? []).map((t: any) => ({
        tripId: t.id ?? '', routeId: t.r ?? '', directionId: t.d ?? null,
        delaySeconds: t.delay ?? null,
      })));

  return {
    schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
    agency,
    feedType,
    capturedAt,
    sourceTimestamp: raw.sourceTimestamp ?? null,
    records,
  };
}

export default async function handler(req: Request) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  const params = queryParams(req);
  const agency = params.get('agency');
  const feedType = params.get('feed') === 'trips' ? 'trip_updates' : 'vehicle_positions';
  const route = params.get('route');
  const knownAgency = LIVE_POLLING_ROUTES.some(config => config.slug === agency);
  if (!agency || !knownAgency) {
    return new Response(JSON.stringify({ error: 'Unknown live agency' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const client = getR2Client();
    const key = await latestKey(client, feedType, agency);
    if (!key) {
      return new Response(JSON.stringify({ schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'unavailable', error: 'No live snapshot available' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const object = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const raw = JSON.parse(await object.Body!.transformToString());
    const snapshot = normalizeSnapshot(raw, feedType, agency, key);
    const ageSeconds = Math.max(0, Math.round(Date.now() / 1000 - snapshot.capturedAt));
    const status = statusForAge(ageSeconds);
    const records = route
      ? snapshot.records.filter((record: any) => record.routeId === route)
      : snapshot.records;

    return new Response(JSON.stringify({ ...snapshot, status, ageSeconds, snapshotKey: key, records }), {
      status: status === 'unavailable' ? 503 : 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'unavailable', error: (error as Error).message }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}
