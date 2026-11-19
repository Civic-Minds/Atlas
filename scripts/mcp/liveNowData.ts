/**
 * Where route_now (CIV-1870) gets the last half hour of vehicle positions: the Live recorder's snapshots
 * (positions/<slug>/<UTC date>/<unix seconds>.json, one a minute). Local MCP only for now.
 *
 * Two readers: a folder of saved snapshots in the same layout (ATLAS_MCP_NOW_DIR, for tests and checks), or R2 through a
 * read-only token (ATLAS_MCP_R2_READ_ACCOUNT_ID / _KEY_ID / _SECRET). It never reads the R2_* keys in .env.local, which
 * can write. ATLAS_MCP_NOW_AT (unix seconds) sets "now" when answering from saved snapshots.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { datesForWindow } from '../../shared/liveArchive';
import { DEFAULT_LIVE_ARCHIVE_BUCKET, LIVE_ARCHIVE_BUCKET_BY_SLUG } from '../../shared/rules/live';
import type { NowSnapshot, NowVehicle } from '../../shared/liveNow';

export interface NowSource {
  /** Snapshots captured from `fromSec` to `toSec`, oldest first. */
  snapshots(slug: string, fromSec: number, toSec: number): Promise<NowSnapshot[]>;
}

type Raw = { capturedAt?: number; ts?: number; records?: NowVehicle[]; vehicles?: NowVehicle[] };
const parse = (raw: Raw): NowSnapshot => ({ capturedAt: raw.capturedAt ?? raw.ts ?? 0, vehicles: (raw.records ?? raw.vehicles ?? []).map(v => ({ ...v, r: String(v.r), d: v.d ?? null })) });
const keySec = (name: string) => Number(name.match(/(\d+)\.json$/)?.[1] ?? NaN);
const datesOf = (fromSec: number, toSec: number) => datesForWindow(toSec * 1000, Math.ceil((toSec - fromSec) / 60));

export function folderNowSource(dir: string): NowSource {
  return {
    async snapshots(slug, fromSec, toSec) {
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
  };
}

export function r2NowSource(env: Record<string, string | undefined>): NowSource | null {
  const accountId = env.ATLAS_MCP_R2_READ_ACCOUNT_ID, accessKeyId = env.ATLAS_MCP_R2_READ_KEY_ID, secretAccessKey = env.ATLAS_MCP_R2_READ_SECRET;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  const client = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  return {
    async snapshots(slug, fromSec, toSec) {
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
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
let source: NowSource | null = env.ATLAS_MCP_NOW_DIR ? folderNowSource(env.ATLAS_MCP_NOW_DIR) : r2NowSource(env);
export function useNowSource(s: NowSource | null): void { source = s; }
export const nowSource = () => source;
/** "Now", in unix seconds: the clock, or ATLAS_MCP_NOW_AT when answering from saved snapshots. */
export const nowSec = () => (env.ATLAS_MCP_NOW_AT ? Number(env.ATLAS_MCP_NOW_AT) : Math.floor(Date.now() / 1000));
