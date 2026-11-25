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

export const NO_READ_KEYS = 'The private Live bucket needs the read-only keys (R2_ACCOUNT_ID, R2_RO_ACCESS_KEY_ID, R2_RO_SECRET_ACCESS_KEY, MCP_LIVE_BUCKET) in the main checkout\'s .env.local.';

let shared: PrivateBucket | null = null;

export function privateBucket(): PrivateBucket {
  if (shared) return shared;
  const { R2_ACCOUNT_ID: account, R2_RO_ACCESS_KEY_ID: accessKeyId, R2_RO_SECRET_ACCESS_KEY: secretAccessKey, MCP_LIVE_BUCKET: bucket } = mainCheckoutEnv();
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
