/**
 * The hosted Atlas Studio MCP's Live files (CIV-1860), written to a PRIVATE bucket that only the hosted Worker binds.
 * Ryan approved this route on 2026-11-18 (CIV-1716 still holds: nothing Kingston-related goes public).
 *
 * For every agency Live records (LIVE_ARCHIVE_SLUGS):
 *   - coverage.json: what is recorded and for how many days (shared/liveCoverage.ts), always.
 *   - manifest.json, ranking.json, routes/<route>.json: the figures, only for routes with enough good days
 *     (liveFiguresReady). Figures switch on, and off again, by themselves.
 * The TTC's figures come from Live's published summaries; every other agency is analysed here with Live's own scripts.
 * live/index.json goes up last and names what each agency has; keys this run did not write are deleted.
 *
 * Runs in a public repo's Actions logs, so it prints counts only: no agency names, routes or figures. Child output goes
 * to --log (default <work>/private.log), which is never uploaded.
 *
 *   npx tsx scripts/mcp/releaseLivePrivate.ts [--dry-run] [--days 15] [--work <dir>] [--only <slug,...>]
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (reads the Live archives and atlas-archive, writes the
 * private bucket), R2_BUCKET_NAME (Live's published TTC files), R2_ARCHIVE_BUCKET_NAME, MCP_LIVE_BUCKET (the private bucket).
 */
import { spawnSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { LIVE_ARCHIVE_SLUGS, liveCoverage, liveFiguresReady, type LiveCoverage } from '../../shared/liveCoverage';
import { LIVE_ARCHIVE_BUCKET_BY_SLUG, DEFAULT_LIVE_ARCHIVE_BUCKET } from '../../shared/rules/live';
import { liveReliabilityFile } from '../../shared/liveReliability';
import type { LiveV3 } from '../../shared/liveDashboard';
import type { AgencySummary } from '../../shared/liveAgency';
import { liveIndexPath, liveSplitPaths, slimRanking, type LiveIndex, type LiveManifest } from './liveData';

const argv = process.argv.slice(2);
const opt = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = argv.includes('--dry-run');
const days = Number(opt('--days') ?? 15);
const work = resolve(opt('--work') ?? join(process.env.RUNNER_TEMP ?? 'tmp', 'mcp-live-private'));
const log = resolve(opt('--log') ?? join(work, 'private.log'));
const only = opt('--only')?.split(',');
mkdirSync(work, { recursive: true });
writeFileSync(log, '');

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing env var ${k}.`); return v; };
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: need('R2_ACCESS_KEY_ID'), secretAccessKey: need('R2_SECRET_ACCESS_KEY') },
});
const PRIVATE = dryRun ? process.env.MCP_LIVE_BUCKET ?? '' : need('MCP_LIVE_BUCKET');
const PUBLIC = need('R2_BUCKET_NAME');
if (PRIVATE && PRIVATE === PUBLIC) throw new Error('MCP_LIVE_BUCKET is the public bucket; refusing.');

async function getText(bucket: string, key: string): Promise<string | null> {
  try { return await (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))).Body!.transformToString(); }
  catch (e) { if ((e as { name?: string }).name === 'NoSuchKey') return null; throw e; }
}
async function listKeys(bucket: string, prefix: string, delimiter?: string): Promise<{ keys: string[]; prefixes: string[] }> {
  const keys: string[] = [], prefixes: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: delimiter, ContinuationToken: token }));
    for (const o of r.Contents ?? []) keys.push(o.Key!);
    for (const p of r.CommonPrefixes ?? []) prefixes.push(p.Prefix!);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return { keys, prefixes };
}

/** Runs one of Live's scripts with its output in the private log only. */
function run(script: string, args: string[]): boolean {
  const r = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), script, ...args], {
    env: { ...process.env, LIVE_DATA: work, NODE_OPTIONS: '--max-old-space-size=8192' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  appendFileSync(log, `\n$ ${script} ${args.join(' ')}\n${r.stdout ?? ''}${r.stderr ?? ''}exit ${r.status}\n`);
  return r.status === 0;
}

/** Service dates (UTC folders) the agency's archive holds. */
async function archiveDates(slug: string): Promise<string[] | null> {
  try {
    const bucket = LIVE_ARCHIVE_BUCKET_BY_SLUG[slug] ?? DEFAULT_LIVE_ARCHIVE_BUCKET;
    const { prefixes } = await listKeys(bucket, `positions/${slug}/`, '/');
    return prefixes.map(p => p.split('/').at(-2)!).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } catch { return null; }
}

interface Built { files: Map<string, unknown>; routes: string[]; manifest: LiveManifest | null }

/** The TTC: Live's own published summaries (live-report-refresh builds them daily). */
async function fromPublished(slug: string): Promise<Built> {
  const files = new Map<string, unknown>();
  const text = await getText(PUBLIC, `atlas/live/${slug}/manifest.json`);
  if (!text) return { files, routes: [], manifest: null };
  const manifest = JSON.parse(text) as LiveManifest;
  const routes: string[] = [];
  for (const route of manifest.routes) {
    const r = await getText(PUBLIC, `atlas/live/${slug}/${route}.json`);
    const f = r ? JSON.parse(r) as { route: string; routeTitle: string; generatedAt: string; v3?: LiveV3 } : null;
    if (f?.v3 && liveFiguresReady(f.v3)) { files.set(liveSplitPaths.route(slug, route), liveReliabilityFile(slug, f.route, f.routeTitle, f.generatedAt, f.v3)); routes.push(route); }
  }
  const agency = await getText(PUBLIC, `atlas/live/${slug}/agency.json`);
  const summary = agency ? (JSON.parse(agency) as { summary?: AgencySummary }).summary : undefined;
  if (summary && routes.length) files.set(liveSplitPaths.ranking(slug), slimRanking({ ...summary, routes: summary.routes.filter(x => routes.includes(x.route)) }));
  return { files, routes, manifest: routes.length ? { ...manifest, routes } : null };
}

/** Any other agency: fetch its archive and timetables, run Live's analysis per route, keep the routes with enough good days. */
function fromArchive(slug: string): Built {
  const files = new Map<string, unknown>();
  const archive = join(work, `archive-${slug}`), feeds = join(work, 'gtfs', 'candidates', `${slug}-feeds`), out = join(work, 'out');
  mkdirSync(out, { recursive: true });
  if (!run('scripts/live-fetch-archive.ts', ['--agency', slug, '--days', String(days), '--out', archive, '--prune'])) return { files, routes: [], manifest: null };
  if (!run('scripts/live-gtfs-for-window.ts', ['--agency', slug, '--days', String(days), '--feeds-dir', feeds, '--archive', archive])) return { files, routes: [], manifest: null };
  const gtfs = existsSync(feeds) ? readdirSync(feeds).map(d => join(feeds, d)).filter(d => existsSync(join(d, 'trips.txt'))).join(',') : '';
  if (!gtfs) return { files, routes: [], manifest: null };
  const archived = [...new Set(readdirSync(archive).map(f => f.match(/^(.+)-\d{4}-\d{2}-\d{2}\.jsonl$/)?.[1]).filter((r): r is string => !!r && /^[A-Za-z0-9]+$/.test(r)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const ready = new Map<string, { generatedAt: string; v3: LiveV3 }>();
  for (const route of archived) {
    const file = join(out, `${slug}-${route}-segments.json`);
    if (!run('scripts/live-segment-delay.ts', ['--gtfs', gtfs, '--archive', archive, '--route', route, '--days', String(days), '--agency', slug, '--out', file])) continue;
    const r = JSON.parse(readFileSync(file, 'utf8')) as { generatedAt?: string; v3?: LiveV3 };
    if (r.v3 && liveFiguresReady(r.v3)) ready.set(route, { generatedAt: r.generatedAt ?? new Date().toISOString(), v3: r.v3 });
  }
  const routes = [...ready.keys()];
  if (!routes.length) return { files, routes, manifest: null };
  // Titles and the ranking come from the agency summary live-segment-delay.ts rebuilds after each route.
  const agencyFile = join(out, `${slug}-agency.json`);
  const summary = existsSync(agencyFile) ? JSON.parse(readFileSync(agencyFile, 'utf8')) as AgencySummary : null;
  const title = (route: string) => summary?.routes.find(x => x.route === route)?.titleLabel ?? `Route ${route}`;
  for (const [route, { generatedAt, v3 }] of ready) files.set(liveSplitPaths.route(slug, route), liveReliabilityFile(slug, route, title(route), generatedAt, v3));
  if (summary) files.set(liveSplitPaths.ranking(slug), slimRanking({ ...summary, routes: summary.routes.filter(x => ready.has(x.route)) }));
  const span = (d: string[]) => d.length ? { from: [...d].sort()[0], to: [...d].sort().at(-1)! } : null;
  const w = [...ready.values()][0].v3.weekly!;
  const manifest: LiveManifest = { agency: slug, generatedAt: [...ready.values()][0].generatedAt, thisWeek: span(w.thisWeek.dates), lastWeek: span(w.lastWeek.dates), routes };
  return { files, routes, manifest };
}

const today = new Date().toISOString().slice(0, 10);
const index: LiveIndex = { generatedAt: new Date().toISOString(), agencies: {} };
const written = new Map<string, unknown>();
let failed = 0;
for (const slug of LIVE_ARCHIVE_SLUGS.filter(s => !only || only.includes(s))) {
  let coverage: LiveCoverage;
  let built: Built = { files: new Map(), routes: [], manifest: null };
  try {
    coverage = liveCoverage(slug, await archiveDates(slug), today);
    if (coverage.daysRecorded) built = slug === 'ttc' ? await fromPublished(slug) : fromArchive(slug);
  } catch (e) {
    failed++;
    appendFileSync(log, `\n${slug}: ${(e as Error).stack ?? e}\n`);
    coverage = liveCoverage(slug, null, today);
  }
  written.set(liveSplitPaths.coverage(slug), coverage);
  if (built.manifest) { written.set(liveSplitPaths.manifest(slug), built.manifest); for (const [k, v] of built.files) written.set(k, v); }
  index.agencies[slug] = { figures: built.routes.length > 0, routes: built.routes.length };
}

const withFigures = Object.values(index.agencies).filter(a => a.figures).length;
const routeFiles = Object.values(index.agencies).reduce((n, a) => n + a.routes, 0);
console.log(`Live MCP files: ${Object.keys(index.agencies).length} agencies, ${withFigures} with figures, ${routeFiles} route files${failed ? `, ${failed} could not be built (see the private log)` : ''}.`);

if (dryRun) {
  const dir = join(work, 'dry-run');
  for (const [k, v] of [...written, [liveIndexPath, index] as const]) { const f = join(dir, k); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, JSON.stringify(v)); }
  console.log('Dry run: nothing uploaded.');
} else {
  const put = (Key: string, v: unknown) => s3.send(new PutObjectCommand({ Bucket: PRIVATE, Key, Body: JSON.stringify(v), ContentType: 'application/json', CacheControl: 'no-cache' }));
  for (const [k, v] of written) await put(k, v);
  await put(liveIndexPath, index);
  // A route or agency that dropped out stops being served: the index no longer lists it, and its old files go.
  const { keys } = await listKeys(PRIVATE, 'live/');
  const stale = keys.filter(k => k !== liveIndexPath && !written.has(k));
  for (const Key of stale) await s3.send(new DeleteObjectCommand({ Bucket: PRIVATE, Key }));
  console.log(`Uploaded ${written.size + 1} files; removed ${stale.length} old ones.`);
}
