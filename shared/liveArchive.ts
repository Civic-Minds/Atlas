import { S3Client } from '@aws-sdk/client-s3';

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

