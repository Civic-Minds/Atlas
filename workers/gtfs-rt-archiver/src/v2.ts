/**
 * CIV-2073: the cloud recorder (atlas.live.v2). Each cron run polls every Live agency at the pace slots that fall in the
 * minute (shared/liveSlots.ts), joins its positions to its trip updates with Live's own join (shared/liveJoin.ts), and
 * writes one gzip snapshot per agency per slot to live/{slug}/{date}/{slot}.json, and once a minute the whole feed's
 * vehicle counts inside each snapshot (CIV-2939). Not deployed until Ryan has upgraded
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
import { buildHourPack, HOUR_SEC, livePackKey } from '../../../shared/liveArchivePack';
import { networkVehicleCounts } from '../../../shared/liveNetworkCount';

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
    // CIV-2939: the whole feed's vehicles, before the route filter (Fleet's "In service now" and "Not on a trip"); no new write.
    network: networkVehicleCounts(positions),
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
    // #1799: a failure names its agency in the log.
    try { return await writeSnapshot(env, await snapshotFor(feed, env, slot)); }
    catch (e) { throw new Error(`${feed.slug} ${slot}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`); }
  }));
  return Promise.allSettled(jobs.map(job => job()));
}

/** #1815: the minute past each UTC hour the first agency's pack of the hour before is written; the next agency's a minute later. */
export const PACK_FIRST_MINUTE = 3;

/**
 * #1815: packs the hour before for one agency a run, from minute PACK_FIRST_MINUTE (so at most one hour of GETs, up to
 * 120, per run). The single snapshots stay. A read that fails leaves the hour unpacked; readers then read its single
 * snapshots, so a pack is always whole.
 */
export async function packRun(feeds: readonly LiveRecorderFeed[], env: V2Env, runStartMs: number): Promise<PromiseSettledResult<string>[]> {
  const minute = new Date(runStartMs).getUTCMinutes();
  const feed = feeds[minute - PACK_FIRST_MINUTE];
  if (!feed) return [];
  const hour = Math.floor(runStartMs / 1000 / HOUR_SEC) * HOUR_SEC - HOUR_SEC;
  const get = async (key: string) => { const obj = await env.BUCKET.get(key); return obj ? new Uint8Array(await obj.arrayBuffer()) : null; };
  return Promise.allSettled([(async () => {
    try {
      const { pack, snapshots } = await buildHourPack(feed.slug, hour, feed.paceSec, get);
      if (snapshots === 0) return `${feed.slug} pack ${hour}: no snapshots`;
      const key = livePackKey(feed.slug, hour);
      await env.BUCKET.put(key, pack, { httpMetadata: { contentType: 'application/octet-stream' } });
      return `${key}: ${snapshots} snapshots (${pack.byteLength} B)`;
    } catch (e) { throw new Error(`${feed.slug} pack ${hour}: ${e instanceof Error ? e.message : String(e)}`); }
  })()]);
}
