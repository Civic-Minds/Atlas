/**
 * Local only (CIV-1974, with CIV-2186): where the dev server reads Atlas Studio's buses-needed and schedule-change files
 * (`<slug>-vehicles.json`, `<slug>-before-after.json`), so nothing is built on the Mac.
 *
 * - **The cloud, by default.** The cloud rebuild (rebuild-release.yml, scripts/studio-builds.ts) uploads them to the
 *   private Live bucket (MCP_LIVE_BUCKET) under STUDIO_FILES_PREFIX (scripts/studio-files-upload.ts). They are read with
 *   the READ-ONLY keys picked out of the main checkout's .env.local (mcp-coverage.ts mainCheckoutEnv), and kept in memory
 *   for a few minutes; nothing is written to disk.
 * - **A folder, only when asked.** STUDIO_DIR (for example tmp/studio after a local build) reads that folder instead.
 *
 * Only names found in the listing are read; nothing from a request reaches a key or a path.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mainCheckoutEnv } from './mcp-coverage.js';
import { STUDIO_FILES_PREFIX, isStudioFileName } from '../shared/studioFiles.js';

export interface StudioFiles {
  list(): Promise<string[]>;
  read(name: string): Promise<string | null>;
}

export function folderStudioFiles(dir: string): StudioFiles {
  const names = async () => (existsSync(dir) ? readdirSync(dir).filter(isStudioFileName) : []);
  return {
    list: names,
    read: async name => ((await names()).includes(name) ? readFileSync(resolve(dir, name), 'utf8') : null),
  };
}

const TTL_MS = 5 * 60_000;

/** The cloud source over two calls: list the prefix's keys, get one key. Kept for TTL_MS. */
export function cloudStudioFiles(listKeys: (prefix: string) => Promise<string[]>, get: (key: string) => Promise<string | null>, now: () => number = Date.now): StudioFiles {
  let listed: { at: number; names: string[] } | null = null;
  const texts = new Map<string, { at: number; text: Promise<string | null> }>();
  const names = async () => {
    if (!listed || now() - listed.at > TTL_MS) {
      const keys = await listKeys(STUDIO_FILES_PREFIX).catch(() => [] as string[]);
      listed = { at: now(), names: keys.map(k => k.slice(STUDIO_FILES_PREFIX.length)).filter(isStudioFileName) };
    }
    return listed.names;
  };
  return {
    list: names,
    read: async name => {
      if (!(await names()).includes(name)) return null;
      const hit = texts.get(name);
      if (hit && now() - hit.at <= TTL_MS) return hit.text;
      const text = get(`${STUDIO_FILES_PREFIX}${name}`).catch(() => null);
      texts.set(name, { at: now(), text });
      return text;
    },
  };
}

let shared: StudioFiles | null = null;

/** The folder when STUDIO_DIR is set, else the cloud; with no read-only keys, nothing. */
export function studioFiles(): StudioFiles {
  if (process.env.STUDIO_DIR) return folderStudioFiles(resolve(process.env.STUDIO_DIR));
  if (shared) return shared;
  const { R2_ACCOUNT_ID: account, R2_RO_ACCESS_KEY_ID: accessKeyId, R2_RO_SECRET_ACCESS_KEY: secretAccessKey, MCP_LIVE_BUCKET: bucket } = mainCheckoutEnv();
  if (!account || !accessKeyId || !secretAccessKey || !bucket) return (shared = { list: async () => [], read: async () => null });
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  shared = cloudStudioFiles(
    async prefix => {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    async key => {
      try { return await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body!.transformToString(); }
      catch (e) { if ((e as { name?: string }).name === 'NoSuchKey') return null; throw e; }
    },
  );
  return shared;
}
