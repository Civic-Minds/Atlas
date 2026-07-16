/**
 * r2.ts — Shared Cloudflare R2 client for Atlas pipeline scripts.
 * Uses the AWS S3 SDK (R2 is S3-compatible).
 *
 * Required env vars (add to .env.local):
 *   R2_ACCOUNT_ID
 *   R2_BUCKET_NAME        — public bucket (live GeoJSON)
 *   R2_PUBLIC_URL         — e.g. https://pub-xxx.r2.dev
 *   R2_ARCHIVE_BUCKET_NAME — private bucket (raw GTFS zip archive)
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 */
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { promisify } from 'node:util';

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
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { requestTimeout: 600_000, connectionTimeout: 30_000 },
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
  return /ssl|tls|bad record mac|ECONNRESET|ETIMEDOUT|timeout|socket hang up|EPIPE/i.test(msg);
}

async function rclonePutFile(key: string, filePath: string, bucket: string): Promise<void> {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const execFileAsync = promisify(execFile);
  const configDir = await mkdtemp(`${tmpdir()}/atlas-rclone-`);
  const configPath = `${configDir}/rclone.conf`;
  const accountId = requireEnv('R2_ACCOUNT_ID');

  await writeFile(configPath, `[atlas]\ntype = s3\nprovider = Cloudflare\naccess_key_id = ${requireEnv('R2_ACCESS_KEY_ID')}\nsecret_access_key = ${requireEnv('R2_SECRET_ACCESS_KEY')}\nendpoint = https://${accountId}.r2.cloudflarestorage.com\n`, { mode: 0o600 });
  try {
    console.warn('  Falling back to rclone for the large R2 upload...');
    await execFileAsync('rclone', [
      'copyto', filePath, `atlas:${bucket}/${key}`,
      '--config', configPath,
      '--s3-chunk-size', '32M',
      '--s3-upload-concurrency', '1',
      '--no-check-dest',
      '--retries', '10',
      '--low-level-retries', '20',
    ], { maxBuffer: 2 * 1024 * 1024 });
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
  console.log(`  rclone upload complete: ${key}`);
}

async function r2PutRaw(key: string, body: string | Buffer | import('fs').ReadStream, contentType: string, bucket: string, contentLength?: number): Promise<void> {
  const client = getR2Client();
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const params: any = { Bucket: bucket, Key: key, Body: body, ContentType: contentType };
      if (contentLength != null) params.ContentLength = contentLength;
      await client.send(new PutObjectCommand(params));
      return;
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

export async function r2Put(key: string, body: string, contentType = 'application/json'): Promise<string> {
  await r2PutRaw(key, body, contentType, requireEnv('R2_BUCKET_NAME'));
  return r2PublicUrl(key);
}

export async function r2PutBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  await r2PutRaw(key, body, contentType, requireEnv('R2_BUCKET_NAME'));
  return r2PublicUrl(key);
}

/**
 * Upload a file to R2. Uses multipart upload for files ≥100 MB (reliable on large
 * files where single-PUT hits SSL "bad record mac" errors mid-stream on Node 24).
 * Falls back to buffered PutObject for small files.
 */
export async function r2PutFile(key: string, filePath: string, contentType: string): Promise<string> {
  const { statSync, readFileSync, createReadStream } = await import('fs');
  const size = statSync(filePath).size;
  const bucket = requireEnv('R2_BUCKET_NAME');

  if (size >= 100 * 1024 * 1024) {
    // Multipart upload — tolerates transient SSL errors per part
    const client = getR2Client();
    const maxPartRetries = 2;
    // Retry the whole multipart upload on transient SSL errors
    for (let attempt = 1; attempt <= maxPartRetries; attempt++) {
      const up = new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: createReadStream(filePath), ContentType: contentType, ContentLength: size },
        partSize: 32 * 1024 * 1024,
        leavePartsOnError: false,
        queueSize: 1,
      });
      let lastPct = 0;
      up.on('httpUploadProgress', (p) => {
        const pct = p.total ? Math.round((p.loaded ?? 0) / p.total * 100) : 0;
        if (pct !== lastPct && pct % 5 === 0) {
          process.stdout.write(`\r  upload ${key}: ${pct}%   `);
          lastPct = pct;
        }
      });
      try {
        await up.done();
        process.stdout.write('\n');
        return r2PublicUrl(key);
      } catch (err) {
        if (attempt < maxPartRetries && isRetryableR2Error(err)) {
          console.warn(`\n  multipart upload error (attempt ${attempt}), retrying...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
          continue;
        }
        if (isRetryableR2Error(err)) {
          await rclonePutFile(key, filePath, bucket);
          return r2PublicUrl(key);
        }
        throw err;
      }
    }
  }

  const body = readFileSync(filePath);
  await r2PutRaw(key, body, contentType, bucket, body.length);
  return r2PublicUrl(key);
}

/** Upload binary to the private archive bucket — no public URL returned. */
export async function r2PutArchive(key: string, body: Buffer, contentType: string): Promise<void> {
  await r2PutRaw(key, body, contentType, requireEnv('R2_ARCHIVE_BUCKET_NAME'));
}

/** Upload JSON text to the private archive bucket. */
export async function r2PutArchiveJson(key: string, body: string): Promise<void> {
  await r2PutRaw(key, body, 'application/json', requireEnv('R2_ARCHIVE_BUCKET_NAME'));
}

async function r2GetRaw(key: string, bucket: string): Promise<string | null> {
  const client = getR2Client();
  const maxAttempts = 4;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return await res.Body!.transformToString();
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
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

/** Read text from the private archive bucket. */
export async function r2GetArchive(key: string): Promise<string | null> {
  return r2GetRaw(key, requireEnv('R2_ARCHIVE_BUCKET_NAME'));
}

export async function r2Get(key: string): Promise<string | null> {
  return r2GetRaw(key, requireEnv('R2_BUCKET_NAME'));
}

async function r2ListAll(bucket: string, prefix: string): Promise<string[]> {
  const client = getR2Client();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const maxAttempts = 4;
    let res: any;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts && isRetryableR2Error(err)) {
          await sleep(500 * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }
    }
    if (!res) throw lastErr;
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function r2List(prefix: string): Promise<string[]> {
  return r2ListAll(requireEnv('R2_BUCKET_NAME'), prefix);
}

export async function r2ListArchive(prefix: string): Promise<string[]> {
  return r2ListAll(requireEnv('R2_ARCHIVE_BUCKET_NAME'), prefix);
}
