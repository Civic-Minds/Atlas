/**
 * Studio's Live files, rebuilt in the cloud every day for every Studio city (CIV-2077; Ryan picked "Add those two checks
 * and switch on a daily automatic run for every Studio city, matching TTC"). The workflow is studio-live-refresh.yml.
 * The Mac's dev server reads them straight from the bucket (local-api/liveFiles.ts, CIV-2186): nothing is copied to or
 * built on the Mac.
 *
 * For every agency Live records, the TTC included (its analysed routes, LIVE_TTC_ANALYSED_ROUTES, with the same steps as
 * live-report-refresh.yml; CIV-2186), it runs Live's route analysis (scripts/liveArchiveAnalysis.ts) and uploads the
 * files Studio's Live page reads (`<slug>-<route>-segments.json`, `-gaps.json`, `<slug>-agency.json`) to the PRIVATE
 * Live bucket (MCP_LIVE_BUCKET, which the Mac's read-only key can read; CIV-2186). Timetables are read from the private
 * archive bucket. Studio is private and this
 * repository is public, so the log prints counts only: no agency, route or figure. Child output goes to --log (default
 * <work>/private.log), which is never uploaded.
 *
 * The two checks from docs/operations/LIVE_ANALYSIS.md:
 * - **No half-finished upload.** Each run writes under its own prefix (`studio-live/runs/<run id>/`) and then switches
 *   `studio-live/current.json` to it in one write. Until that write, Studio keeps reading the previous run. A failed
 *   upload deletes its own prefix and leaves the pointer alone.
 * - **No thin weeks.** An agency's new files replace its old ones only when each of its two weeks has at least
 *   LIVE_MIN_HEALTHY_DAYS_PER_WEEK good days (on any of its routes). A first build needs only this week. Otherwise the
 *   pointer keeps the agency's previous run.
 *
 *   npx tsx scripts/studio-live-cloud.ts [--dry-run] [--days 15] [--work <dir>] [--only <slug,...>] [--run-id <id>]
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ARCHIVE_BUCKET_NAME (timetables), MCP_LIVE_BUCKET (the
 * private bucket the files go to), R2_BUCKET_NAME (the public bucket, only to refuse writing there).
 */
import { spawnSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { LIVE_ARCHIVE_SLUGS } from '../shared/liveCoverage';
import { LIVE_TTC_ANALYSED_ROUTES } from '../shared/rules/live';
import type { LiveV3 } from '../shared/liveDashboard';
import { analyseArchivedAgency, LiveBuildFailed } from './liveArchiveAnalysis';
import { STUDIO_LIVE_POINTER, studioLiveRunPrefix, acceptStudioLiveBuild, goodDaysByWeek, nextStudioLivePointer, runsToPrune, type StudioLivePointer } from './studioLiveRun';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = argv.includes('--dry-run');
const days = Number(opt('--days') ?? 15);
const work = resolve(opt('--work') ?? join(process.env.RUNNER_TEMP ?? 'tmp', 'studio-live'));
const log = resolve(opt('--log') ?? join(work, 'private.log'));
const only = opt('--only')?.split(',');
const runId = opt('--run-id') ?? process.env.GITHUB_RUN_ID ?? new Date().toISOString().replace(/\D/g, '').slice(0, 14);
if (!/^[A-Za-z0-9-]+$/.test(runId)) throw new Error('--run-id: letters, digits and dashes only.');
mkdirSync(work, { recursive: true });
writeFileSync(log, '');

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing env var ${k}.`); return v; };
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: need('R2_ACCESS_KEY_ID'), secretAccessKey: need('R2_SECRET_ACCESS_KEY') },
});
// CIV-2186: the files go to the private Live bucket the Mac's read-only key reads; timetables still come from the archive.
need('R2_ARCHIVE_BUCKET_NAME');
const PRIVATE = need('MCP_LIVE_BUCKET');
if (PRIVATE === process.env.R2_BUCKET_NAME) throw new Error('MCP_LIVE_BUCKET is the public bucket; refusing.');

async function getText(key: string): Promise<string | null> {
  try { return await (await s3.send(new GetObjectCommand({ Bucket: PRIVATE, Key: key }))).Body!.transformToString(); }
  catch (e) { if ((e as { name?: string }).name === 'NoSuchKey') return null; throw e; }
}
async function listKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: PRIVATE, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) keys.push(o.Key!);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
/** Deletes keys under studio-live/ only: the bucket also holds the hosted MCP's Live files. */
async function deleteKeys(keys: string[]): Promise<void> {
  for (const Key of keys) {
    if (!Key.startsWith('studio-live/runs/')) throw new Error('Refusing to delete outside studio-live/runs/.');
    await s3.send(new DeleteObjectCommand({ Bucket: PRIVATE, Key }));
  }
}

/** #1789 (CIV-2907): per agency, runs that started partway along their trip and the trip starts rated (counts only, for the public log). */
const partway = new Map<string, { runs: number; starts: number }>();
let currentSlug = '';
function countPartway(stdout: string | null): void {
  for (const m of (stdout ?? '').matchAll(/^#1789: (\d+) runs in the window started partway .*?of (\d+) rated trip starts/gm)) {
    const c = partway.get(currentSlug) ?? { runs: 0, starts: 0 };
    c.runs += Number(m[1]); c.starts += Number(m[2]);
    partway.set(currentSlug, c);
  }
}

/** Runs one of Live's scripts with its output in the private log only. */
function run(script: string, args: string[]): boolean {
  const r = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), script, ...args], {
    env: { ...process.env, LIVE_DATA: work, NODE_OPTIONS: '--max-old-space-size=8192' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  appendFileSync(log, `\n$ ${script} ${args.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}exit ${r.status}\n`);
  countPartway(r.stdout);
  return r.status === 0;
}

/** Runs a shell script (live-analyze.sh) the same way, output in the private log only. */
function runShell(script: string, args: string[]): boolean {
  const r = spawnSync('bash', [script, ...args], { env: { ...process.env, LIVE_DATA: work, NODE_OPTIONS: '--max-old-space-size=8192' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  appendFileSync(log, `\n$ ${script} ${args.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}exit ${r.status}\n`);
  countPartway(r.stdout);
  return r.status === 0;
}

/**
 * The TTC's analysis (CIV-2186), with live-report-refresh.yml's steps: its analysed routes' positions, the stored surface
 * timetable for each service date, every route's analysis and the agency summary. The same shape as analyseArchivedAgency.
 */
function analyseTtc(): { outDir: string; routes: Map<string, { file: string; v3?: LiveV3 }> } {
  const outDir = join(work, 'out');
  mkdirSync(outDir, { recursive: true });
  const routes = LIVE_TTC_ANALYSED_ROUTES.join(',');
  if (!run('scripts/live-fetch-archive.ts', ['--days', String(days), '--out', join(work, 'archive'), '--prune', '--routes', routes])) throw new LiveBuildFailed('fetch');
  if (!run('scripts/live-gtfs-for-window.ts', ['--days', String(days), '--feeds-dir', join(work, 'gtfs', 'candidates', 'surface-feeds'), '--surface', join(work, 'gtfs', 'candidates', 'surface'), '--archive', join(work, 'archive')])) throw new LiveBuildFailed('timetables');
  if (!runShell('scripts/live-analyze.sh', ['all', '--days', String(days)])) throw new LiveBuildFailed('analysis');
  const out = new Map<string, { file: string; v3?: LiveV3 }>();
  for (const route of LIVE_TTC_ANALYSED_ROUTES) {
    const file = join(outDir, `ttc-${route}-segments.json`);
    if (existsSync(file)) out.set(route, { file, v3: (JSON.parse(readFileSync(file, 'utf8')) as { v3?: LiveV3 }).v3 });
  }
  return { outDir, routes: out };
}

// A dry run may run with read-only keys that can't read the private Live bucket: it then builds as a first run would.
const previous = JSON.parse(await getText(STUDIO_LIVE_POINTER).catch(e => { if (dryRun) return null; throw e; }) ?? 'null') as StudioLivePointer | null;
const built: Record<string, { files: string[]; thisWeek: number; lastWeek: number }> = {};
let failed = 0, thin = 0;
for (const slug of LIVE_ARCHIVE_SLUGS.filter(s => !only || only.includes(s))) {
  currentSlug = slug;
  try {
    const a = slug === 'ttc' ? analyseTtc() : analyseArchivedAgency(slug, { work, days, run });
    const weeks = goodDaysByWeek([...a.routes.values()].map(r => r.v3));
    if (!a.routes.size || !acceptStudioLiveBuild(weeks, !!previous?.agencies[slug])) { thin++; continue; }
    const agencyFile = join(a.outDir, `${slug}-agency.json`);
    // Each route's analysis and, where written, its gaps file (the gaps chart; CIV-2186), then the agency summary.
    const gaps = (f: string) => f.replace(/-segments\.json$/, '-gaps.json');
    const files = [...[...a.routes.values()].flatMap(r => [r.file, ...(existsSync(gaps(r.file)) ? [gaps(r.file)] : [])]), ...(existsSync(agencyFile) ? [agencyFile] : [])];
    built[slug] = { files, ...weeks };
  } catch (e) {
    failed++;
    appendFileSync(log, `\n${slug}: ${(e as Error).stack ?? e}\n`);
  }
}

const pointer = nextStudioLivePointer(previous, runId, new Date().toISOString(),
  Object.fromEntries(Object.entries(built).map(([slug, b]) => [slug, { files: b.files.map(f => basename(f)), thisWeekGoodDays: b.thisWeek, lastWeekGoodDays: b.lastWeek }])));
const fileCount = Object.values(built).reduce((n, b) => n + b.files.length, 0);
console.log(`Studio Live: ${Object.keys(built).length} agencies rebuilt (${fileCount} files), ${thin} kept their last files (thin week or no routes), ${failed} could not be built (see the private log); ${Object.keys(pointer.agencies).length} agencies in the new pointer.`);

for (const [slug, c] of [...partway].sort((a, b) => b[1].runs - a[1].runs)) console.log(`#1789 ${slug}: ${c.runs} runs started partway, of ${c.starts} rated trip starts`);

if (dryRun) {
  const dir = join(work, 'dry-run');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'current.json'), JSON.stringify(pointer, null, 2));
  console.log('Dry run: nothing uploaded.');
} else if (!Object.keys(built).length) {
  console.log('Nothing new to upload; the pointer is unchanged.');
} else {
  const prefix = studioLiveRunPrefix(runId);
  try {
    for (const [slug, b] of Object.entries(built)) for (const f of b.files) {
      await s3.send(new PutObjectCommand({ Bucket: PRIVATE, Key: `${prefix}${slug}/${basename(f)}`, Body: readFileSync(f), ContentType: 'application/json' }));
    }
  } catch (e) {
    appendFileSync(log, `\nupload: ${(e as Error).stack ?? e}\n`);
    console.error('Uploading the Studio Live files failed part-way; removing them. Studio keeps the previous run.');
    try { await deleteKeys(await listKeys(prefix)); } catch (e2) { appendFileSync(log, `\ncleanup: ${(e2 as Error).stack ?? e2}\n`); console.error('Could not remove the partial run (see the private log); the pointer still names the previous run.'); }
    process.exit(1);
  }
  // The switch: one write. Before it Studio reads the previous run, after it this one.
  try {
    await s3.send(new PutObjectCommand({ Bucket: PRIVATE, Key: STUDIO_LIVE_POINTER, Body: JSON.stringify(pointer), ContentType: 'application/json', CacheControl: 'no-cache' }));
  } catch (e) {
    appendFileSync(log, `\npointer: ${(e as Error).stack ?? e}\n`);
    console.error('Writing the pointer failed; Studio keeps the previous run.');
    process.exit(1);
  }
  // Runs no agency points at any more go, except the newest few (a manual undo can point back at one).
  const stale = runsToPrune(await listKeys('studio-live/runs/'), pointer);
  await deleteKeys(stale);
  console.log(`Uploaded ${fileCount} files and switched the pointer; removed ${stale.length} old files.`);
}
