/**
 * CIV-2073: the cloud recorder (atlas.live.v2). Each cron run polls every Live agency at the pace slots that fall in the
 * minute (shared/liveSlots.ts), joins its positions to its trip updates with Live's own join (shared/liveJoin.ts), and
 * writes one gzip snapshot per agency per slot to live/{slug}/{date}/{slot}.json. Not deployed until Ryan has upgraded
 * the Workers plan and the manager gives the go (the free plan's 10 ms CPU can't decode a trip-update feed).
 */
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { SITE_URL } from '../../../shared/rules/paths';
import { joinLiveFeed } from '../../../shared/liveJoin';
import { liveSlotKey, slotsInRun } from '../../../shared/liveSlots';
import { LIVE_SNAPSHOT_V2_SCHEMA_VERSION, type LiveSnapshotV2 } from '../../../shared/liveContract';
import { liveRouteIdNames } from '../../../shared/livePollingConfig';
import type { LiveRecorderFeed } from '../../../shared/liveRecorderFeeds';
import { fetchFeed as fetchWithRetry } from './fetchFeed';

export interface V2Env {
  BUCKET: R2Bucket;
  [secret: string]: unknown;
}

const USER_AGENT = `atlas-live-recorder/1.0 (${SITE_URL})`;

type Decoded = Record<string, any>;

async function fetchFeed(url: string, feed: LiveRecorderFeed, env: V2Env): Promise<Decoded> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  let finalUrl = url;
  const key = feed.apiKey ? env[feed.apiKey.env] as string | undefined : undefined;
  if (feed.apiKey && !key) throw new Error(`${feed.slug}: ${feed.apiKey.env} is not set`);
  if (feed.apiKey?.header) headers.apikey = key!;
  else if (feed.apiKey?.param) finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${feed.apiKey.param}=${encodeURIComponent(key!)}`;
  // #1741: a 5xx (Hamilton's HTTP 530) is retried once a few seconds later, as every v1 shard does.
  const res = await fetchWithRetry(finalUrl, { headers });
  if (!res.ok) throw new Error(`${feed.slug}: HTTP ${res.status}`);
  const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
  // The same decoding Live's own polling does (local-api/live-vehicles.ts), so the join reads the same objects.
  return FeedMessage.toObject(FeedMessage.decode(new Uint8Array(await res.arrayBuffer())), { longs: Number, enums: String, bytes: String });
}

/** One agency's snapshot for a slot: its positions joined to its trip updates (or positions alone). */
export async function snapshotFor(feed: LiveRecorderFeed, env: V2Env, slotSec: number): Promise<LiveSnapshotV2> {
  const [positions, trips] = await Promise.all([
    fetchFeed(feed.positionsUrl, feed, env),
    feed.tripsUrl ? fetchFeed(feed.tripsUrl, feed, env).catch(() => null) : Promise.resolve(null),
  ]);
  const filter = new RegExp(feed.routeFilterSource);
  const names = liveRouteIdNames(feed.slug);
  // Every route the feed's filter keeps (history needs them all); headways pool under Live's short name where Live names the route.
  const { records, headways } = joinLiveFeed(positions, trips, id => (filter.test(id) ? names.get(id)?.shortName ?? id : undefined), slotSec);
  return {
    schemaVersion: LIVE_SNAPSHOT_V2_SCHEMA_VERSION,
    agency: feed.slug,
    capturedAt: slotSec,
    sourceTimestamp: positions.header?.timestamp ?? null,
    tripsTimestamp: trips?.header?.timestamp ?? null,
    paceSec: feed.paceSec,
    tripsOk: trips != null,
    headways,
    records,
  };
}

async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Writes a snapshot under its slot key, gzip-stored (readers sniff the gzip bytes: shared/liveSource.ts). */
export async function writeSnapshot(env: V2Env, snap: LiveSnapshotV2): Promise<string> {
  const key = liveSlotKey(snap.agency, snap.capturedAt);
  const body = await gzip(JSON.stringify(snap));
  await env.BUCKET.put(key, body, { httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' } });
  return `${key}: ${snap.records.length} vehicles (${body.byteLength} B gzip)`;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

/**
 * One cron run: for each feed, every slot boundary in [runStart, runStart + 60 s), waiting until it arrives. One write
 * per slot and no state between runs; a failed feed fails alone.
 */
export async function recordRun(feeds: readonly LiveRecorderFeed[], env: V2Env, runStartMs: number, now: () => number = Date.now): Promise<PromiseSettledResult<string>[]> {
  const runStartSec = Math.floor(runStartMs / 1000);
  const jobs = feeds.flatMap(feed => slotsInRun(runStartSec, feed.paceSec).map(slot => async () => {
    await wait(slot * 1000 - now());
    return writeSnapshot(env, await snapshotFor(feed, env, slot));
  }));
  return Promise.allSettled(jobs.map(job => job()));
}
