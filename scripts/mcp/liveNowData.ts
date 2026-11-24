/**
 * Where route_now (CIV-1870) gets the last half hour of vehicle positions: the Live recorder's snapshots
 * (positions/<slug>/<UTC date>/<unix seconds>.json, one a minute). The hosted server reads them through its bucket binding.
 *
 * Two readers: a folder of saved snapshots in the same layout (ATLAS_MCP_NOW_DIR, for tests and checks), or R2 through a
 * read-only token (ATLAS_MCP_R2_READ_ACCOUNT_ID / _KEY_ID / _SECRET). It never reads the R2_* keys in .env.local, which
 * can write. ATLAS_MCP_NOW_AT (unix seconds) sets "now" when answering from saved snapshots.
 *
 * The read-only token's three values come from the environment, else from its credentials file on this Mac
 * (ATLAS_MCP_R2_READ_ENV, by default ~/Developer/Credentials/Cloudflare R2 read-only for Atlas MCP.env): KEY=value lines.
 * The values are never logged.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { datesForWindow } from '../../shared/liveArchive';
import { DEFAULT_LIVE_ARCHIVE_BUCKET, LIVE_ARCHIVE_BUCKET_BY_SLUG } from '../../shared/rules/live';
import type { NowSnapshot, NowVehicle } from '../../shared/liveNow';
import { asNowSnapshot, snapshotsBetween, type LiveStore } from '../../shared/liveSource';
import { livePaceSec } from '../../shared/rules/live';

export interface NowSource {
  /** Snapshots captured from `fromSec` to `toSec`, oldest first. */
  snapshots(slug: string, fromSec: number, toSec: number): Promise<NowSnapshot[]>;
  /** CIV-2073: the store the recorder's v2 snapshots are read through (shared/liveSource.ts). */
  store?: LiveStore;
}

/**
 * CIV-2073: the recorder's v2 snapshots first, read by slot; the v1 positions only for the part of the window before the
 * first v2 snapshot (until v1 data expires, 60 days after the switch).
 */
export function withV2(v1: NowSource['snapshots'], store: LiveStore): NowSource['snapshots'] {
  return async (slug, fromSec, toSec) => {
    const v2 = (await snapshotsBetween(store, slug, fromSec, toSec, livePaceSec(slug))).map(asNowSnapshot);
    const firstV2 = v2[0]?.capturedAt ?? toSec + 1;
    const older = firstV2 > fromSec ? (await v1(slug, fromSec, Math.min(toSec, firstV2 - 1))) : [];
    return [...older, ...v2];
  };
}

type Raw = { capturedAt?: number; ts?: number; records?: NowVehicle[]; vehicles?: NowVehicle[] };
const parse = (raw: Raw): NowSnapshot => ({ capturedAt: raw.capturedAt ?? raw.ts ?? 0, vehicles: (raw.records ?? raw.vehicles ?? []).map(v => ({ ...v, r: String(v.r), d: v.d ?? null })) });
const keySec = (name: string) => Number(name.match(/(\d+)\.json$/)?.[1] ?? NaN);
const datesOf = (fromSec: number, toSec: number) => datesForWindow(toSec * 1000, Math.ceil((toSec - fromSec) / 60));

export function folderNowSource(dir: string): NowSource {
  const store: LiveStore = async key => (existsSync(join(dir, key)) ? new Uint8Array(readFileSync(join(dir, key))) : null);
  return { store, snapshots: withV2(folderV1(dir), store) };
}

function folderV1(dir: string): NowSource['snapshots'] {
  return {
    async snapshots(slug: string, fromSec: number, toSec: number) {
      const out: NowSnapshot[] = [];
      for (const date of datesOf(fromSec, toSec)) {
        const d = join(dir, 'positions', slug, date);
        if (!existsSync(d)) continue;
        for (const f of readdirSync(d)) {
          const t = keySec(f);
          if (t >= fromSec && t <= toSec) out.push(parse(JSON.parse(readFileSync(join(d, f), 'utf8')) as Raw));
        }
      }
      return out.sort((a, b) => a.capturedAt - b.capturedAt);
    },
  }.snapshots;
}

export function r2NowSource(env: Record<string, string | undefined>): NowSource | null {
  const accountId = env.ATLAS_MCP_R2_READ_ACCOUNT_ID, accessKeyId = env.ATLAS_MCP_R2_READ_KEY_ID, secretAccessKey = env.ATLAS_MCP_R2_READ_SECRET;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  const client = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  // CIV-2073: v2 snapshots by key (GET only, never LIST); S3 hands back the stored gzip bytes as they are.
  const store: LiveStore = async key => {
    try {
      const bucket = LIVE_ARCHIVE_BUCKET_BY_SLUG[key.split('/')[1]] ?? DEFAULT_LIVE_ARCHIVE_BUCKET;
      return await (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body!.transformToByteArray();
    } catch { return null; }
  };
  const v1 = {
    async snapshots(slug: string, fromSec: number, toSec: number) {
      const bucket = LIVE_ARCHIVE_BUCKET_BY_SLUG[slug] ?? DEFAULT_LIVE_ARCHIVE_BUCKET;
      const keys: string[] = [];
      for (const date of datesOf(fromSec, toSec)) {
        let token: string | undefined;
        do {
          const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `positions/${slug}/${date}/`, ContinuationToken: token }));
          for (const o of page.Contents ?? []) { const t = o.Key ? keySec(o.Key) : NaN; if (t >= fromSec && t <= toSec) keys.push(o.Key!); }
          token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
      }
      const snaps = await Promise.all(keys.map(async Key => {
        try { return parse(JSON.parse(await (await client.send(new GetObjectCommand({ Bucket: bucket, Key }))).Body!.transformToString()) as Raw); } catch { return null; }
      }));
      return snaps.filter((s): s is NowSnapshot => s != null).sort((a, b) => a.capturedAt - b.capturedAt);
    },
  };
  return { store, snapshots: withV2(v1.snapshots, store) };
}

/** The few calls route_now needs from an R2 bucket binding (a Worker's R2Bucket fits). */
export interface NowBucket {
  list(o: { prefix: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
  get(key: string): Promise<{ json<T>(): Promise<T>; arrayBuffer(): Promise<ArrayBuffer> } | null>;
}

/** The hosted server's reader (CIV-1870): the Live archive bucket through its Worker binding, read only. */
export function bucketNowSource(bucket: NowBucket): NowSource {
  // CIV-2073: v2 snapshots by key through the binding, which hands back the stored gzip bytes as they are.
  const store: LiveStore = async key => {
    const obj = await bucket.get(key);
    return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
  };
  const v1 = {
    async snapshots(slug: string, fromSec: number, toSec: number) {
      const keys: string[] = [];
      for (const date of datesOf(fromSec, toSec)) {
        let cursor: string | undefined;
        do {
          const page = await bucket.list({ prefix: `positions/${slug}/${date}/`, cursor });
          for (const o of page.objects) { const t = keySec(o.key); if (t >= fromSec && t <= toSec) keys.push(o.key); }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
      }
      const snaps = await Promise.all(keys.map(async key => {
        try { const obj = await bucket.get(key); return obj ? parse(await obj.json<Raw>()) : null; } catch { return null; }
      }));
      return snaps.filter((s): s is NowSnapshot => s != null).sort((a, b) => a.capturedAt - b.capturedAt);
    },
  };
  return { store, snapshots: withV2(v1.snapshots, store) };
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const READ_KEYS = ['ATLAS_MCP_R2_READ_ACCOUNT_ID', 'ATLAS_MCP_R2_READ_KEY_ID', 'ATLAS_MCP_R2_READ_SECRET'] as const;
/** The read-only token from the environment, or from its credentials file; only the three read-only names are taken. */
export function readTokenEnv(e: Record<string, string | undefined>, file = e.ATLAS_MCP_R2_READ_ENV ?? join(homedir(), 'Developer/Credentials/Cloudflare R2 read-only for Atlas MCP.env')): Record<string, string | undefined> {
  if (READ_KEYS.every(k => e[k])) return e;
  if (!existsSync(file)) return e;
  const fromFile: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && (READ_KEYS as readonly string[]).includes(m[1])) fromFile[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return { ...e, ...fromFile };
}
let source: NowSource | null = env.ATLAS_MCP_NOW_DIR ? folderNowSource(env.ATLAS_MCP_NOW_DIR) : r2NowSource(readTokenEnv(env));
export function useNowSource(s: NowSource | null): void { source = s; }
export const nowSource = () => source;
/** "Now", in unix seconds: the clock, or ATLAS_MCP_NOW_AT when answering from saved snapshots. */
export const nowSec = () => (env.ATLAS_MCP_NOW_AT ? Number(env.ATLAS_MCP_NOW_AT) : Math.floor(Date.now() / 1000));
