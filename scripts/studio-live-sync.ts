/**
 * Opt-in only (CIV-2186): copies Studio's cloud-built Live files (CIV-2077, scripts/studio-live-cloud.ts) into a local
 * folder (LIVE_SEGMENTS_DIR, default ../_live-data/out), for a same-zip comparison. Studio itself no longer needs this:
 * the dev server reads the cloud's files directly (local-api/liveFiles.ts). Reads only.
 *
 *   npm run studio:sync               every agency the pointer names
 *   npm run studio:sync -- --only kingston
 *
 * Each agency is swapped whole: its files are downloaded to a side folder first, and only when all of them arrived do
 * they replace the agency's old files, so a broken download never leaves a mix of two runs.
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (read-only is enough), MCP_LIVE_BUCKET.
 */
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { parseSegmentsFileName } from '../shared/liveStudioAgencies';
import { STUDIO_LIVE_POINTER, studioLiveRunPrefix, type StudioLivePointer } from './studioLiveRun';
import { getR2Client, requireEnv } from '../pipeline/r2';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const only = opt('--only')?.split(',');
const bucket = requireEnv('MCP_LIVE_BUCKET');
const s3 = getR2Client();
const get = async (Key: string) => (await s3.send(new GetObjectCommand({ Bucket: bucket, Key }))).Body!.transformToString();

const dir = resolve(process.env.LIVE_SEGMENTS_DIR ?? '../_live-data/out');
mkdirSync(dir, { recursive: true });
const pointer = JSON.parse(await get(STUDIO_LIVE_POINTER)) as StudioLivePointer;

/** The files in the folder that belong to this agency: its route analyses and its summary. */
const agencyFiles = (slug: string) => readdirSync(dir).filter(f => parseSegmentsFileName(f)?.slug === slug || f === `${slug}-agency.json`);

for (const [slug, a] of Object.entries(pointer.agencies)) {
  if (only && !only.includes(slug)) continue;
  if (!/^[a-z0-9-]+$/.test(slug) || a.files.some(f => !/^[A-Za-z0-9-]+\.json$/.test(f))) throw new Error(`Unexpected name in the pointer for ${slug}.`);
  const side = join(dir, `.sync-${slug}`);
  rmSync(side, { recursive: true, force: true });
  mkdirSync(side);
  for (const f of a.files) writeFileSync(join(side, f), await get(`${studioLiveRunPrefix(a.run)}${slug}/${f}`));
  for (const f of agencyFiles(slug)) rmSync(join(dir, f));
  for (const f of a.files) renameSync(join(side, f), join(dir, f));
  rmSync(side, { recursive: true });
  console.log(`${slug}: ${a.files.length} files from ${a.builtAt.slice(0, 10)} (good days: this week ${a.thisWeekGoodDays}, last week ${a.lastWeekGoodDays})`);
}
