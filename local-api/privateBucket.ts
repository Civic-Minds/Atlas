/**
 * CIV-2914: the one way local code reads the private Live bucket (MCP_LIVE_BUCKET: Live analysis, Studio's files, the
 * MCP's Live files), with the READ-ONLY keys picked out of the main checkout's .env.local (mcp-coverage.ts
 * mainCheckoutEnv; the write keys never enter this process). Without them it throws: a reader that quietly answered
 * "nothing" would look like missing data, not a missing key.
 */
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mainCheckoutEnv } from './mcp-coverage.js';

export interface PrivateBucket {
  /** A file's text, or null when it isn't there. */
  get(key: string): Promise<string | null>;
  /** Every key under a prefix. */
  list(prefix: string): Promise<string[]>;
}

export const NO_READ_KEYS = 'The private Live bucket needs the read-only keys (R2_ACCOUNT_ID, R2_LIVE_READ_ACCESS_KEY_ID and R2_LIVE_READ_SECRET_ACCESS_KEY, or R2_RO_ACCESS_KEY_ID and R2_RO_SECRET_ACCESS_KEY, and MCP_LIVE_BUCKET) in the main checkout\'s .env.local.';

/** #1928: the Live bucket's own read-only token where it is set, else the R2_RO_* token (today's keys). Both of a pair or neither. */
export function liveReadKeys(env: Partial<Record<string, string>>): { accessKeyId?: string; secretAccessKey?: string } {
  if (env.R2_LIVE_READ_ACCESS_KEY_ID && env.R2_LIVE_READ_SECRET_ACCESS_KEY) return { accessKeyId: env.R2_LIVE_READ_ACCESS_KEY_ID, secretAccessKey: env.R2_LIVE_READ_SECRET_ACCESS_KEY };
  return { accessKeyId: env.R2_RO_ACCESS_KEY_ID, secretAccessKey: env.R2_RO_SECRET_ACCESS_KEY };
}

let shared: PrivateBucket | null = null;

export function privateBucket(): PrivateBucket {
  if (shared) return shared;
  const env = mainCheckoutEnv();
  const { R2_ACCOUNT_ID: account, MCP_LIVE_BUCKET: bucket } = env;
  const { accessKeyId, secretAccessKey } = liveReadKeys(env);
  if (!account || !accessKeyId || !secretAccessKey || !bucket) throw new Error(NO_READ_KEYS);
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId, secretAccessKey } });
  shared = {
    async get(key) {
      try { return await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body!.transformToString(); }
      catch (e) { if ((e as { name?: string }).name === 'NoSuchKey') return null; throw e; }
    },
    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
  };
  return shared;
}
