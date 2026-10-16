// Writes one route-values JSON per agency from a reprocess output folder, using the filter rule of
// the checkout being judged. Compare two outputs with: report.py route-values <base> <branch>. See README.md.
// usage: cd <tree> && npx tsx <here>/route-values.mts <tree> <derivedDir> <outDir> [slug ...]
//   <derivedDir>/<slug>/<slug>.json (reprocess-derived-artifacts output) or <derivedDir>/<slug>.json.
//   Without slugs it reads every agency folder in <derivedDir>. An agency whose output exists is skipped.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { extractRouteValues, type FilterRules } from './routeValues.ts';

const [tree, derivedDir, outDir, ...only] = process.argv.slice(2);
if (!tree || !derivedDir || !outDir) { console.error('usage: npx tsx route-values.mts <tree> <derivedDir> <outDir> [slug ...]'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const rules = await import(pathToFileURL(`${tree}/shared/routeHeadwayFilter.ts`).href) as FilterRules;
const slugs = only.length ? only : readdirSync(derivedDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
for (const slug of slugs) {
  const outPath = `${outDir}/${slug}.json`;
  if (existsSync(outPath)) continue;
  const file = [`${derivedDir}/${slug}/${slug}.json`, `${derivedDir}/${slug}.json`].find(existsSync);
  if (!file) { console.log(`${slug} no route file`); continue; }
  const fc = JSON.parse(readFileSync(file, 'utf8')) as { features: Parameters<typeof extractRouteValues>[0] };
  const routes = extractRouteValues(fc.features, rules);
  writeFileSync(outPath, JSON.stringify({ slug, tree, routes }));
  console.log(`${slug} routes=${Object.keys(routes).length}`);
}
