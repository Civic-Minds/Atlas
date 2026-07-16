import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { LIVE_SNAPSHOT_SCHEMA_VERSION, type LiveFeedType } from '../shared/liveContract.js';

export const LIVE_BUCKET = process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live';

export function getR2Client(): S3Client {
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

export function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function prefixFor(feedType: LiveFeedType, agency: string, date: string): string {
  return feedType === 'vehicle_positions'
    ? `positions/${agency}/${date}/`
    : `${agency}/${date}/`;
}

export function statusForAge(ageSeconds: number): 'fresh' | 'degraded' | 'stale' | 'unavailable' {
  if (ageSeconds <= 90) return 'fresh';
  if (ageSeconds <= 300) return 'degraded';
  if (ageSeconds <= 900) return 'stale';
  return 'unavailable';
}

export function normalizeSnapshot(raw: any, feedType: LiveFeedType, agency: string, key: string) {
  const capturedAt = Number(raw.capturedAt ?? raw.ts ?? key.match(/(\d{10})\.json$/)?.[1] ?? 0);
  const sourceRecords = raw.records ?? (feedType === 'vehicle_positions' ? raw.vehicles : raw.trips) ?? [];
  const records = feedType === 'vehicle_positions'
    ? sourceRecords.map((v: any) => ({
        id: v.id ?? '', routeId: v.routeId ?? v.r ?? '', tripId: v.tripId ?? '', directionId: v.directionId ?? v.d ?? null,
        lat: v.lat, lon: v.lon, speedKmh: v.speedKmh ?? v.spd ?? null, bearing: v.bearing ?? v.brg ?? null,
        stopId: v.stopId ?? null, stopSequence: v.stopSequence ?? null,
        currentStatus: v.currentStatus ?? null, reportedAt: v.reportedAt ?? v.t ?? null,
      }))
    : sourceRecords.map((t: any) => ({
        tripId: t.tripId ?? t.id ?? '', routeId: t.routeId ?? t.r ?? '', directionId: t.directionId ?? t.d ?? null,
        delaySeconds: t.delaySeconds ?? t.delay ?? null,
      }));

  return {
    schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION,
    agency,
    feedType,
    capturedAt,
    sourceTimestamp: raw.sourceTimestamp ?? null,
    records,
  };
}

export async function listKeys(
  client: S3Client,
  feedType: LiveFeedType,
  agency: string,
  start: number,
  end: number,
): Promise<string[]> {
  const dates = new Set<string>();
  const cursorDate = new Date(start * 1000);
  cursorDate.setUTCHours(0, 0, 0, 0);
  const lastDate = new Date(end * 1000);
  lastDate.setUTCHours(0, 0, 0, 0);
  for (const date = cursorDate; date <= lastDate; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.add(dateString(date));
  }

  const keys: string[] = [];
  for (const date of dates) {
    let cursor: string | undefined;
    do {
      const result = await client.send(new ListObjectsV2Command({
        Bucket: LIVE_BUCKET,
        Prefix: prefixFor(feedType, agency, date),
        ContinuationToken: cursor,
      }));
      for (const object of result.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }
      cursor = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (cursor);
  }
  return keys;
}

export async function readSnapshot(client: S3Client, key: string, feedType: LiveFeedType, agency: string) {
  const object = await client.send(new GetObjectCommand({ Bucket: LIVE_BUCKET, Key: key }));
  return normalizeSnapshot(JSON.parse(await object.Body!.transformToString()), feedType, agency, key);
}
