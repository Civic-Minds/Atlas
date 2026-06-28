import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getLiveRouteConfig } from '../shared/livePollingConfig.js';
import { computeHistoryAdherence, type Snapshot } from '../shared/computeHistoryAdherence.js';
import { R2_PUBLIC_URL } from '../shared/config.js';

export const config = { maxDuration: 60 };

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function queryParams(req: Request & { url?: string }): URLSearchParams {
  const raw = req.url ?? '';
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  return new URLSearchParams(qs);
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function listKeysForDate(client: S3Client, slug: string, date: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live',
      Prefix: `${slug}/${date}/`,
      ContinuationToken: cursor,
    }));
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    cursor = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (cursor);
  return keys;
}

async function fetchSnapshot(client: S3Client, key: string): Promise<Snapshot | null> {
  try {
    const res = await client.send(new GetObjectCommand({
      Bucket: process.env.R2_LIVE_BUCKET_NAME ?? 'atlas-live',
      Key: key,
    }));
    const text = await res.Body!.transformToString();
    return JSON.parse(text) as Snapshot;
  } catch {
    return null;
  }
}

async function fetchSidecar(agency: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetch(`${R2_PUBLIC_URL}/atlas/live-polling/${agency}.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function handler(req: Request) {
  const params = queryParams(req);
  const agency = params.get('agency');
  const route = params.get('route');
  const days = Math.min(parseInt(params.get('days') ?? '7', 10), 30);

  if (!agency || !route || !getLiveRouteConfig(agency, route)) {
    return new Response(JSON.stringify({ error: 'Invalid agency/route pair.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const client = getR2Client();
    const sidecarPromise = fetchSidecar(agency);

    // Build list of dates to fetch
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      dates.push(dateStr(d));
    }

    // List all keys across all dates in parallel
    const keysByDate = await Promise.all(dates.map(date => listKeysForDate(client, agency, date)));
    const allKeys = keysByDate.flat();

    if (allKeys.length === 0) {
      return new Response(JSON.stringify({ noData: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sample keys: every other file (10-min resolution), capped at 500 to bound response time
    const strideKeys = allKeys.filter((_, i) => i % 2 === 0);
    const sampledKeys = strideKeys.slice(0, 500);
    const snapshots = (await Promise.all(sampledKeys.map(k => fetchSnapshot(client, k)))).filter(Boolean) as Snapshot[];

    const sidecar = await sidecarPromise;
    const routeSidecar = sidecar?.[route];
    const overrideHeadway = routeSidecar?.scheduledHeadwayMin;

    const result = computeHistoryAdherence(agency, route, snapshots, days, overrideHeadway);
    if (!result || result.sampleCount === 0) {
      return new Response(JSON.stringify({ noData: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[history-adherence]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
