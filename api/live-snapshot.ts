import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { LIVE_SNAPSHOT_SCHEMA_VERSION, type LiveFeedType } from '../shared/liveContract.js';
import { isRateLimited } from '../shared/rateLimit.js';
import { requestHeader } from '../shared/request.js';
import { jsonResponse, type ApiResponse } from '../shared/http.js';
import type { ApiRequest } from '../shared/request.js';
import { getR2Client, listKeys, readSnapshot, statusForAge } from './liveStore.js';
import type { S3Client } from '@aws-sdk/client-s3';

export const config = { maxDuration: 30 };

function queryParams(req: ApiRequest): URLSearchParams {
  const raw = req.url ?? '';
  return new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '');
}

async function latestKey(client: S3Client, feedType: LiveFeedType, agency: string): Promise<string | null> {
  const end = Math.floor(Date.now() / 1000);
  const keys = await listKeys(client, feedType, agency, end - 24 * 60 * 60, end);
  keys.sort((a, b) => b.localeCompare(a));
  return keys[0] ?? null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const ip = requestHeader(req, 'x-real-ip') ?? requestHeader(req, 'x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) {
    return jsonResponse(res, { error: 'Too many requests' }, 429, { 'Retry-After': '60' });
  }

  const params = queryParams(req);
  const agency = params.get('agency');
  const feedType = params.get('feed') === 'trips' ? 'trip_updates' : 'vehicle_positions';
  const route = params.get('route');
  const knownAgency = LIVE_POLLING_ROUTES.some(config => config.slug === agency);
  if (!agency || !knownAgency) {
    return jsonResponse(res, { error: 'Unknown live agency' }, 400);
  }

  try {
    const client = getR2Client();
    const key = await latestKey(client, feedType, agency);
    if (!key) {
      return jsonResponse(res, { schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'unavailable', error: 'No live snapshot available' }, 503);
    }

    const snapshot = await readSnapshot(client, key, feedType, agency);
    const ageSeconds = Math.max(0, Math.round(Date.now() / 1000 - snapshot.capturedAt));
    const status = statusForAge(ageSeconds);
    const records = route
      ? snapshot.records.filter((record: any) => record.routeId === route)
      : snapshot.records;

    return jsonResponse(res, { ...snapshot, status, ageSeconds, snapshotKey: key, records }, status === 'unavailable' ? 503 : 200, { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' });
  } catch (error) {
    return jsonResponse(res, { schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'unavailable', error: (error as Error).message }, 503);
  }
}
