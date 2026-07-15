import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig.js';
import { LIVE_SNAPSHOT_SCHEMA_VERSION, type LiveFeedType } from '../shared/liveContract.js';
import { isRateLimited } from '../shared/rateLimit.js';
import { getR2Client, LIVE_BUCKET, listKeys, readSnapshot } from './liveStore.js';

export const config = { maxDuration: 30 };
const MAX_RANGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_SNAPSHOTS = 120;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export default async function handler(req: Request) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) return json({ error: 'Too many requests' }, 429);

  const params = new URL(req.url).searchParams;
  const agency = params.get('agency');
  const feedType: LiveFeedType = params.get('feed') === 'trips' ? 'trip_updates' : 'vehicle_positions';
  const route = params.get('route');
  const end = Number(params.get('end') ?? Math.floor(Date.now() / 1000));
  const start = Number(params.get('start') ?? end - 60 * 60);
  const limit = Math.min(MAX_SNAPSHOTS, Math.max(1, Number(params.get('limit') ?? 60)));
  const knownAgency = LIVE_POLLING_ROUTES.some(config => config.slug === agency);

  if (!agency || !knownAgency || !Number.isFinite(start) || !Number.isFinite(end) || start > end || end - start > MAX_RANGE_SECONDS) {
    return json({ error: 'Invalid agency or replay range' }, 400);
  }

  try {
    const client = getR2Client();
    const keys = await listKeys(client, feedType, agency, start, end);
    const selected = keys
      .map(key => ({ key, capturedAt: Number(key.match(/(\d{10})\.json$/)?.[1] ?? 0) }))
      .filter(item => item.capturedAt >= start && item.capturedAt <= end)
      .sort((a, b) => a.capturedAt - b.capturedAt)
      .slice(0, limit);
    const snapshots = [];
    for (const item of selected) {
      const snapshot = await readSnapshot(client, item.key, feedType, agency);
      snapshots.push({ ...snapshot, snapshotKey: item.key, records: route ? snapshot.records.filter((record: any) => record.routeId === route) : snapshot.records });
    }
    if (!snapshots.length) return json({ schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'unavailable', error: 'No live snapshots in requested range' }, 404);
    return json({ schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'available', start, end, returned: snapshots.length, hasMore: selected.length < keys.length, snapshots });
  } catch (error) {
    return json({ schemaVersion: LIVE_SNAPSHOT_SCHEMA_VERSION, agency, feedType, status: 'unavailable', error: (error as Error).message }, 503);
  }
}
