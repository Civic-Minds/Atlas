import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

export function liveArchiveClient(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export interface ArchivedVehicle {
  id: string;
  r: string; // route_id
  d: number | null; // direction_id
  lat: number;
  lon: number;
  spd: number | null;
  brg: number | null;
  t: number | null; // per-vehicle GTFS-RT position timestamp
}

/**
 * Every UTC calendar date a [now - sinceMinutes, now] window could touch.
 * Snapshots are keyed by UTC date (`positions/{slug}/{date}/{ts}.json`), so a
 * "last hour" window in the evening in Toronto can straddle two UTC dates —
 * exported so the boundary case is independently testable.
 */
export function datesForWindow(nowMs: number, sinceMinutes: number): string[] {
  const cutoffMs = nowMs - sinceMinutes * 60_000;
  const dates = new Set<string>();
  for (let t = cutoffMs; t <= nowMs; t += 20 * 60_000) {
    dates.add(new Date(t).toISOString().slice(0, 10));
  }
  dates.add(new Date(nowMs).toISOString().slice(0, 10));
  return [...dates];
}

/**
 * Read archived vehicle positions for `slug` captured in the last `sinceMinutes`.
 * Lists every date prefix the window touches (not just "today") and paginates
 * each listing instead of assuming a single page.
 */
export async function fetchRecentPositions(
  slug: string,
  sinceMinutes: number,
  bucket = process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live',
): Promise<{ capturedAt: number; vehicles: ArchivedVehicle[] }[]> {
  const client = liveArchiveClient();
  if (!client) return [];

  const nowMs = Date.now();
  const dates = datesForWindow(nowMs, sinceMinutes);
  const cutoffSec = Math.floor((nowMs - sinceMinutes * 60_000) / 1000);
  const keys: string[] = [];
  for (const date of dates) {
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `positions/${slug}/${date}/`,
        ContinuationToken: token,
      }));
      for (const o of page.Contents ?? []) {
        if (!o.Key) continue;
        const match = o.Key.match(/\/(\d+)\.json$/);
        const capturedAt = match ? Number(match[1]) : null;
        if (capturedAt != null && capturedAt >= cutoffSec) keys.push(o.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  const snapshots = await Promise.all(keys.map(async key => {
    try {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const parsed = JSON.parse(await object.Body!.transformToString());
      const vehicles: ArchivedVehicle[] = parsed.vehicles ?? parsed.records ?? [];
      const capturedAt: number = parsed.capturedAt ?? parsed.ts ?? 0;
      return { capturedAt, vehicles };
    } catch {
      return null;
    }
  }));

  return snapshots.filter((s): s is { capturedAt: number; vehicles: ArchivedVehicle[] } => s !== null);
}
