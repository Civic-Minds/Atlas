/**
 * Uploads Atlas Studio's buses-needed and schedule-change files (CIV-1974) to the private Live bucket under
 * STUDIO_FILES_PREFIX, where the dev server reads them (local-api/studioFiles.ts). Each file replaces its own key only;
 * an agency not in --from keeps the files it has.
 *
 *   npx tsx scripts/studio-files-upload.ts [--from tmp/studio] [--only ttc,hamilton] [--dry-run]
 *
 * The cloud rebuild runs it after scripts/studio-builds.ts (agencies marked dryRunOnly are never built there, so their
 * cloud files stay as they are). TTC, Hamilton and Kingston's files are the Mac's current ones, uploaded once by hand with
 * --only after Ryan's go, until their values are cleared (#1710, Hamilton 01, Kingston's value OK).
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (write), MCP_LIVE_BUCKET, R2_BUCKET_NAME (only to refuse it).
 */
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { STUDIO_FILES_PREFIX, isStudioFileName } from '../shared/studioFiles';
import { privateLiveBucketName, requireEnv } from '../pipeline/r2';
import { assertKnownFlags } from '../pipeline/cliFlags';

assertKnownFlags(process.argv.slice(2), { '--dry-run': 'flag', '--from': 'value', '--only': 'value' }); // CIV-3017: a mistyped flag must not turn into a real write
const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const from = resolve(opt('--from') ?? 'tmp/studio');
const only = opt('--only')?.split(',').filter(Boolean);
const dryRun = argv.includes('--dry-run');

const slugOf = (name: string) => name.replace(/-(?:vehicles|before-after)\.json$/, '');
const names = readdirSync(from).filter(isStudioFileName).filter(n => !only || only.includes(slugOf(n))).sort();
if (!names.length) { console.log('studio-files-upload: no Studio files to upload.'); process.exit(0); }
if (dryRun) { console.log(`studio-files-upload: would upload ${names.length} files (dry run).`); process.exit(0); }

const bucket = privateLiveBucketName();
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: requireEnv('R2_ACCESS_KEY_ID'), secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY') },
});
for (const n of names) {
  const body = readFileSync(join(from, n));
  JSON.parse(body.toString('utf8')); // never upload a broken file
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `${STUDIO_FILES_PREFIX}${n}`, Body: body, ContentType: 'application/json', CacheControl: 'no-cache' }));
}
// Counts only: this runs in a public repository's logs.
console.log(`studio-files-upload: uploaded ${names.length} files.`);
