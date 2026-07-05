/**
 * upload-pmtiles.ts — Re-upload a pre-built atlas.pmtiles to R2.
 *
 * Usage: npx tsx pipeline/upload-pmtiles.ts <path-to-atlas.pmtiles>
 *
 * Uses multipart upload so large files (800+ MB) succeed even on flaky links.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

dotenv.config({ path: '.env.local' });
dotenv.config();

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

async function main() {
  const filePath = process.argv[2] || 'tmp/geojson-build/atlas.pmtiles';
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const size = fs.statSync(absPath).size;
  console.log(`Uploading ${path.basename(absPath)} (${(size / 1024 / 1024).toFixed(1)} MB) to R2...`);

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const upload = new Upload({
    client,
    params: {
      Bucket: requireEnv('R2_BUCKET_NAME'),
      Key: 'atlas.pmtiles',
      Body: fs.createReadStream(absPath),
      ContentType: 'application/octet-stream',
      ContentLength: size,
    },
    // 32 MB parts, sequential — reduces TLS timeout risk on long uploads
    partSize: 32 * 1024 * 1024,
    queueSize: 1,
    leavePartsOnError: false,
  });

  upload.on('httpUploadProgress', (progress) => {
    const pct = progress.total ? ((progress.loaded ?? 0) / progress.total * 100).toFixed(1) : '?';
    process.stdout.write(`\r  ${pct}% (${((progress.loaded ?? 0) / 1024 / 1024).toFixed(0)} MB / ${(size / 1024 / 1024).toFixed(0)} MB)   `);
  });

  await upload.done();
  process.stdout.write('\n');
  console.log(`Uploaded: https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev/atlas.pmtiles`);
}

main().catch(err => {
  console.error('Upload failed:', err);
  process.exit(1);
});
