/**
 * Builds the hosted MCP Worker's bundled data (workers/atlas-mcp/test-data, read through the ASSETS binding with
 * DATA_FROM_ASSETS; wrangler.pilot-test.jsonc) from the published release, with this checkout's code, so every deploy
 * answers as the site does (CIV-3111: the deploy workflow runs it after CI passes on main).
 *
 * Read only: the release's route files and History come over the public data URL; nothing is written to R2. The split
 * files are made by the same scripts the release uses (buildIndex.ts, then splitRelease.ts), for the same agencies
 * (catalog-public, minus beta-only). It refuses (exit 1) when more than MAX_DROPPED of the agencies in the release's own
 * MCP files are missing, so a bad download never ships a Worker that has quietly lost agencies.
 *
 *   npx tsx scripts/mcp/workerAssets.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runWithConcurrency } from '../../pipeline/utils';
import { DEFAULT_R2_PUBLIC_URL } from '../../shared/rules/paths';
import { splitPaths, type SplitManifest } from '../../shared/mcpSplitStore';

/** Agencies of the release's MCP files the build may lose before the deploy stops (an intended removal, e.g. CIV-3100). */
const MAX_DROPPED = 5;

const base = (process.env.DATA_ORIGIN ?? DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');
const work = resolve('tmp/mcp-worker');
const routes = join(work, 'routes');
const out = resolve('workers/atlas-mcp/test-data');

async function get(path: string): Promise<string | null> {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${base}/${path}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.text();
    } catch (err) {
      last = err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw last;
}
const json = async <T>(path: string): Promise<T | null> => { const text = await get(path); return text == null ? null : JSON.parse(text) as T; };

const release = await json<{ releaseId: string; agencyPrefix: string }>(`atlas/release.json?t=${Date.now()}`);
if (!release) throw new Error('No release pointer at atlas/release.json.');
const catalog = (JSON.parse(readFileSync(resolve('public/data/catalog-public.json'), 'utf8')) as { agencies: Array<{ slug: string; betaOnly?: boolean }> })
  .agencies.filter(a => !a.betaOnly).map(a => a.slug);

rmSync(work, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(routes, { recursive: true });

// 1. Route files, one flat folder of <slug>.json (the layout the disk store reads with ATLAS_MCP_DATA_DIR).
const missing: string[] = [];
await runWithConcurrency(catalog.map(slug => async () => {
  const body = await get(`${release.agencyPrefix}/${slug}.json`);
  if (body == null) missing.push(slug); else writeFileSync(join(routes, `${slug}.json`), body);
}), 8);
console.log(`${release.releaseId}: route files for ${catalog.length - missing.length} of ${catalog.length} public agencies${missing.length ? ` (none for ${missing.sort().join(', ')})` : ''}.`);

// 2. History, as published.
const historyFile = join(work, 'history-config.json');
const history = await get('atlas/history-config.json');
if (history == null) throw new Error('atlas/history-config.json is missing.');
writeFileSync(historyFile, history);

// 3. The index and the split files, with the scripts the release uses.
const env = { ...process.env, ATLAS_ROOT: process.cwd(), ATLAS_MCP_DATA_DIR: routes, ATLAS_MCP_HISTORY_FILE: historyFile, ATLAS_MCP_RELEASE: release.releaseId };
for (const [script, extra] of [['scripts/mcp/buildIndex.ts', []], ['scripts/mcp/splitRelease.ts', [out]]] as const) {
  const run = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), script, ...extra], { env, stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`${script} failed (exit ${run.status}).`);
}

// 4. The guard: compare with the agencies in the release's own MCP files.
const built = (JSON.parse(readFileSync(join(out, splitPaths.manifest), 'utf8')) as SplitManifest).agencies;
const published = (await json<SplitManifest>(`atlas/releases/${release.releaseId}/mcp/${splitPaths.manifest}`))?.agencies;
if (!built.length) throw new Error('The build has no agencies.');
if (published) {
  const have = new Set(built);
  const dropped = published.filter(slug => !have.has(slug)).sort();
  console.log(`${built.length} agencies built; the release's MCP files have ${published.length}${dropped.length ? `; missing: ${dropped.join(', ')}` : ''}.`);
  if (dropped.length > MAX_DROPPED) throw new Error(`${dropped.length} agencies of the release's MCP files are missing (at most ${MAX_DROPPED} may be). Not deploying.`);
} else {
  console.log(`${built.length} agencies built; the release has no MCP files to compare with.`);
  if (missing.length > MAX_DROPPED) throw new Error(`${missing.length} route files are missing (at most ${MAX_DROPPED} may be). Not deploying.`);
}
