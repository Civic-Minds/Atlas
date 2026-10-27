/**
 * Local check of the search index (CIV-1048): builds it from per-agency output folders
 * (`<dir>/<slug>/<slug>.json` and `<slug>-stops.json`) and reports sizes. Writes nothing to R2.
 * Usage: npx tsx scripts/search-index-local.ts <dir> [outDir]
 */
import fs from 'fs';
import path from 'path';
import { gzipSync } from 'zlib';
import { planSearchIndex, uploadSearchIndex, type SearchAgencyInput } from '../pipeline/searchIndex';

const [dir, outDir] = process.argv.slice(2);
if (!dir) throw new Error('Usage: npx tsx scripts/search-index-local.ts <dir> [outDir]');
const agencies: SearchAgencyInput[] = [];
for (const slug of fs.readdirSync(dir).sort()) {
  const routesPath = path.join(dir, slug, `${slug}.json`);
  if (!fs.existsSync(routesPath)) continue;
  const stopsPath = path.join(dir, slug, `${slug}-stops.json`);
  agencies.push({
    slug,
    routes: JSON.parse(fs.readFileSync(routesPath, 'utf8')),
    stops: fs.existsSync(stopsPath) ? JSON.parse(fs.readFileSync(stopsPath, 'utf8')) : null,
  });
}
const plan = planSearchIndex(agencies, 'atlas/releases/release-local');
const gz = (body: string) => gzipSync(body, { level: 9 }).length;
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const byKind = (re: RegExp) => plan.files.filter(f => re.test(f.key)).map(f => gz(f.body)).sort((a, b) => a - b);
const stops = byKind(/\/stops\//);
const pages = byKind(/\/pages\//);
console.log(`${agencies.length} agencies, ${plan.stats.routes} routes, ${plan.stats.splits} stop splits, ${plan.stats.pages} pages`);
console.log(`routes.json ${kb(byKind(/routes\.json$/)[0])} gz; index.json ${kb(byKind(/index\.json$/)[0])} gz`);
console.log(`pages: median ${kb(pages[pages.length >> 1])}, max ${kb(pages[pages.length - 1])} gz`);
console.log(`stop splits: median ${kb(stops[stops.length >> 1])}, p90 ${kb(stops[Math.floor(stops.length * 0.9)])}, p99 ${kb(stops[Math.floor(stops.length * 0.99)])}, max ${kb(stops[stops.length - 1])}, total ${(stops.reduce((a, b) => a + b, 0) / 1048576).toFixed(1)} MB gz`);

// Upload counts against an in-memory bucket: first run, then the same release again.
const bucket = new Set<string>();
const io = {
  listKeys: async (prefix: string) => [...bucket].filter(k => k.startsWith(prefix)),
  put: async (key: string) => { bucket.add(key); },
  runWithConcurrency: async <T>(tasks: Array<() => Promise<T>>) => { for (const t of tasks) await t(); },
};
console.log('first run', await uploadSearchIndex(plan.files, io));
console.log('unchanged second run', await uploadSearchIndex(planSearchIndex(agencies, 'atlas/releases/release-local2').files, io));

if (outDir) {
  for (const f of plan.files) {
    fs.mkdirSync(path.dirname(path.join(outDir, f.key)), { recursive: true });
    fs.writeFileSync(path.join(outDir, f.key), f.body);
  }
  console.log(`wrote ${plan.files.length} files to ${outDir}`);
}
