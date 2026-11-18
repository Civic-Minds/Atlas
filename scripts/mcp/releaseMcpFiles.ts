/**
 * Builds a data release's Atlas Studio MCP files and uploads them to atlas/releases/<releaseId>/mcp/ (CIV-1855), the
 * folder the hosted MCP Worker reads once the release pointer names that release. Runs in the release workflows after
 * the release's agency files are uploaded and History is rebuilt, before the pointer moves.
 *
 *   npx tsx scripts/mcp/releaseMcpFiles.ts                         # publish: the release in tmp/atlas-release-manifest.json
 *   npx tsx scripts/mcp/releaseMcpFiles.ts --dry-run --data-dir tmp/derived-reprocess
 *   npx tsx scripts/mcp/releaseMcpFiles.ts --dry-run --data-dir <folder> --only ttc,hamilton   # a quick local check
 *
 * Steps: route files (the release's own agency files, downloaded, or a local folder with --data-dir), History
 * (--history-file, else atlas/history-config.json read from the bucket, which build-history has just written), then buildIndex.ts and
 * splitRelease.ts with that release id, the Live reliability files for each agency Live publishes (CIV-1860), then the
 * upload. manifest.json goes up last: the Worker counts a release as
 * ready only once it exists. --dry-run builds everything and uploads nothing. A summary is written to
 * tmp/mcp-release/report.json.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { IMMUTABLE_CACHE_CONTROL, r2Get, r2PutFile } from '../../pipeline/r2';
import { runWithConcurrency } from '../../pipeline/utils';
import { splitPaths } from '../../shared/mcpSplitStore';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dataDir = opt('--data-dir');
const only = opt('--only')?.split(',').filter(Boolean);
const work = resolve('tmp/mcp-release');
const routes = join(work, 'routes');
const out = join(work, 'out');

const manifestPath = resolve('tmp/atlas-release-manifest.json');
const release = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { releaseId: string; agencyPrefix: string } : null;
if (!release && !dryRun) throw new Error('No tmp/atlas-release-manifest.json: run build-pmtiles first (or use --dry-run).');
const releaseId = release?.releaseId ?? `dry-run-${process.env.GITHUB_RUN_ID ?? 'local'}`;

const catalog = (JSON.parse(readFileSync(resolve('public/data/catalog-public.json'), 'utf8')) as { agencies: Array<{ slug: string; betaOnly?: boolean }> }).agencies.filter(a => !a.betaOnly && (!only || only.includes(a.slug))).map(a => a.slug);

rmSync(work, { recursive: true, force: true });
mkdirSync(routes, { recursive: true });

// 1. Route files, one flat folder of <slug>.json (the layout the disk store reads with ATLAS_MCP_DATA_DIR).
const missing: string[] = [];
if (dataDir) {
  for (const slug of catalog) {
    const file = [join(dataDir, slug, `${slug}.json`), join(dataDir, `${slug}.json`)].find(f => existsSync(f));
    if (file) symlinkSync(resolve(file), join(routes, `${slug}.json`)); else missing.push(slug);
  }
} else {
  await runWithConcurrency(catalog.map(slug => async () => {
    const body = await r2Get(`${release!.agencyPrefix}/${slug}.json`);
    if (body == null) { missing.push(slug); return; }
    writeFileSync(join(routes, `${slug}.json`), body);
  }), 6);
}
console.log(`Route files: ${catalog.length - missing.length} of ${catalog.length} public agencies${missing.length ? ` (none for ${missing.sort().join(', ')})` : ''}.`);

// 2. History: the file this run built, else the public one.
let historyFile = opt('--history-file');
if (!historyFile || !existsSync(historyFile)) {
  historyFile = join(work, 'history-config.json');
  // Read from the bucket, not the cached public URL: build-history has only just written it.
  const body = await r2Get('atlas/history-config.json');
  if (body == null) throw new Error('atlas/history-config.json is missing.');
  writeFileSync(historyFile, body);
}

// 3. The index and the split files, with the same scripts the local server uses.
const env = { ...process.env, ATLAS_ROOT: process.cwd(), ATLAS_MCP_DATA_DIR: routes, ATLAS_MCP_HISTORY_FILE: resolve(historyFile), ATLAS_MCP_RELEASE: releaseId };
for (const [script, extra] of [['scripts/mcp/buildIndex.ts', []], ['scripts/mcp/splitRelease.ts', [out, ...(only ?? [])]]] as const) {
  const run = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), script, ...extra], { env, stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`${script} failed (exit ${run.status}).`);
}

// Live figures (CIV-1860) are not in the release: they go to a private bucket (scripts/mcp/releaseLivePrivate.ts).

// 4. Upload, manifest last.
const files: string[] = [];
const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else files.push(relative(out, p)); } };
walk(out);
const bytes = files.reduce((n, f) => n + statSync(join(out, f)).size, 0);
const prefix = `atlas/releases/${releaseId}/mcp`;
const report = { releaseId, dryRun, prefix, files: files.length, megabytes: Math.round(bytes / 1e5) / 10, agencies: catalog.length - missing.length, missing: missing.sort() };
writeFileSync(join(work, 'report.json'), JSON.stringify(report, null, 2));
if (dryRun) {
  console.log(`Dry run: ${files.length} MCP files (${report.megabytes} MB) built for ${releaseId}; would upload to ${prefix}/. Nothing uploaded.`);
} else {
  const body = files.filter(f => f !== splitPaths.manifest);
  await runWithConcurrency(body.map(f => async () => { await r2PutFile(`${prefix}/${f}`, join(out, f), 'application/json', { cacheControl: IMMUTABLE_CACHE_CONTROL }); }), 6);
  await r2PutFile(`${prefix}/${splitPaths.manifest}`, join(out, splitPaths.manifest), 'application/json', { cacheControl: IMMUTABLE_CACHE_CONTROL });
  console.log(`Uploaded ${files.length} MCP files (${report.megabytes} MB) to ${prefix}/.`);
}
