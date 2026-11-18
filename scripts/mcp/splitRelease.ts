/**
 * Builds the split MCP release files (CIV-1840) from the route files this Mac reads, into a LOCAL folder. It writes
 * nothing to R2: uploading the folder to the release's mcp/ prefix rides the next batched data rebuild.
 *
 *   ATLAS_ROOT=<checkout> nice -n 15 npx tsx scripts/mcp/splitRelease.ts <out dir> [slug ...]
 *
 * Summaries are made with the same functions route_frequency uses, rows are the map's normalised rows, so the hosted
 * tools answer as the local ones do (scripts/mcp/goldenRun.mjs checks it).
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { splitPaths, type SplitManifest } from '../../shared/mcpSplitStore';
import { diskStore, indexFile } from './diskStore';
import { agencyFiles } from './splitBuild';
console.log = (...args: unknown[]) => console.error(...args);
const data = await import('./atlasData');

const [out, ...only] = process.argv.slice(2);
if (!out) throw new Error('Usage: splitRelease.ts <out dir> [slug ...]');
const put = (path: string, value: unknown) => { const file = join(out, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value)); };

const store = diskStore();
data.useStore(store);
const catalog = await store.catalog();
const meta = await store.meta();
const have = await data.availableAgencies();
// Agencies may be named by slug, short name or name. With names, only those are split (a check build).
const wanted = new Set<string>();
for (const q of only) { const a = await data.findAgency(q); if (!a) throw new Error(`No agency matching "${q}".`); wanted.add(a.slug); }
const agencies = have.filter(a => !wanted.size || wanted.has(a.slug));
console.error(`${agencies.length} agencies to split into ${out}`);

put(splitPaths.catalog, catalog);
put(splitPaths.meta, Object.fromEntries(meta));
const idx = indexFile();
if (idx && existsSync(idx)) copyFileSync(idx, join(out, splitPaths.index));
const hist = await store.history();
if (hist) put(splitPaths.history, hist);

for (const [i, a] of agencies.entries()) {
  for (const [path, value] of await agencyFiles(a)) put(path, value);
  data.forget(a.slug);
  if ((i + 1) % 25 === 0 || i + 1 === agencies.length) console.error(`${i + 1}/${agencies.length}`);
}
const manifest: SplitManifest = { releaseId: 'local-' + (process.env.ATLAS_MCP_RELEASE ?? 'cache'), builtAt: new Date().toISOString(), // A check build of a few agencies can still list every agency (ATLAS_SPLIT_MANIFEST_ALL=1), so list_agencies answers as the full release does.
  agencies: (process.env.ATLAS_SPLIT_MANIFEST_ALL ? have : agencies).map(a => a.slug) };
put(splitPaths.manifest, manifest);
console.error(`Wrote ${out}`);
