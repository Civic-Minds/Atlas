/**
 * r2.ts — Shared Cloudflare R2 client for Atlas pipeline scripts.
 * Uses the AWS S3 SDK (R2 is S3-compatible).
 *
 * Required env vars (add to .env.local):
 *   R2_ACCOUNT_ID
 *   R2_BUCKET_NAME
 *   R2_PUBLIC_URL   (e.g. https://pub-xxx.r2.dev)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 */
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export function getR2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export function r2PublicUrl(key: string): string {
  const base = requireEnv('R2_PUBLIC_URL').replace(/\/$/, '');
  return `${base}/${key}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableR2Error(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ssl|tls|bad record mac|ECONNRESET|ETIMEDOUT|timeout|socket hang up/i.test(msg);
}

export async function r2Put(key: string, body: string, contentType = 'application/json'): Promise<string> {
  const client = getR2Client();
  const bucket = requireEnv('R2_BUCKET_NAME');
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
      return r2PublicUrl(key);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isRetryableR2Error(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function r2PutBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  const client = getR2Client();
  const bucket = requireEnv('R2_BUCKET_NAME');
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
      return r2PublicUrl(key);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isRetryableR2Error(err)) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function r2Get(key: string): Promise<string | null> {
  const client = getR2Client();
  const bucket = requireEnv('R2_BUCKET_NAME');
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await res.Body!.transformToString();
  } catch (e: any) {
    if (e.name === 'NoSuchKey') return null;
    throw e;
  }
}

export async function r2List(prefix: string): Promise<string[]> {
  const client = getR2Client();
  const bucket = requireEnv('R2_BUCKET_NAME');
  const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents ?? []).map(o => o.Key!).filter(Boolean);
}
