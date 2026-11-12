/**
 * Build atlas/night-service.json fresh from the agencies' route files (CIV-1341, #1333).
 *
 *   npx tsx pipeline/build-night-service.ts                       # read published files, upload
 *   npx tsx pipeline/build-night-service.ts --dry-run             # write tmp/night-service.json only
 *   npx tsx pipeline/build-night-service.ts --dry-run --local-dir tmp/derived-reprocess
 *
 * The weekly refresh merges into the existing file and only replaces agencies whose feed changed,
 * so a rebuild that changes the night rules leaves unchanged agencies stale. This builds the whole
 * file with no merge. Run it once, after every agency has finished (never per shard).
 * --local-dir prefers <dir>/<slug>/<slug>.json (a dry run's output) and falls back to R2.
 * Writes to R2 unless --dry-run, so it needs the same go-ahead as any R2 write.
 */
import './loadEnv.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { r2Get, r2Put } from './r2.js';
import { runWithConcurrency } from './utils.js';
import { buildNightServiceIndex, extractNightServiceRoutes, type NightServiceRouteEntry } from './nightServiceIndex.js';

interface IndexAgency {
  slug: string;
  name: string;
  region?: string | null;
}

function argValue(flag: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
  return value;
}

const dryRun = process.argv.includes('--dry-run');
const localDir = argValue('--local-dir');

const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: IndexAgency[] };
// Every agency in index.json, exactly the weekly refresh's scope (refresh.ts), so hidden and
// beta-only agencies keep their rows.
const agencies = index.agencies;

let fromLocal = 0;
const publishedSlugs: string[] = [];
const noRouteFile: string[] = [];
const all: NightServiceRouteEntry[] = [];

const tasks = agencies.map(agency => async () => {
  const localPath = localDir ? resolve(localDir, agency.slug, `${agency.slug}.json`) : null;
  let raw: string | null = null;
  if (localPath && existsSync(localPath)) {
    raw = readFileSync(localPath, 'utf8');
    fromLocal++;
  } else {
    raw = await r2Get(`atlas/${agency.slug}.json`); // a read error throws and stops the build
    if (raw) publishedSlugs.push(agency.slug);
  }
  if (!raw) {
    noRouteFile.push(agency.slug);
    return;
  }
  const features = (JSON.parse(raw) as { features: Parameters<typeof extractNightServiceRoutes>[3] }).features;
  all.push(...extractNightServiceRoutes(agency.slug, agency.name, agency.region ?? null, features));
});
await runWithConcurrency(tasks, 8);

if (noRouteFile.length) console.warn(`  [warn] no route file for ${noRouteFile.length} agencies: ${noRouteFile.join(', ')}`);
const file = buildNightServiceIndex(all);
if (file.routeCount === 0) throw new Error('Built an empty night-service.json; refusing to write it.');

if (localDir) console.log(`  read from the published file, not the dry run (${publishedSlugs.length}): ${publishedSlugs.sort().join(', ') || 'none'}`);
const summary = `night-service: ${file.routeCount} routes across ${file.agencyCount} agencies (from ${fromLocal} dry-run files, ${publishedSlugs.length} published files; ${agencies.length} agencies checked)`;
if (dryRun) {
  mkdirSync(resolve('tmp'), { recursive: true });
  writeFileSync(resolve('tmp/night-service.json'), JSON.stringify(file));
  console.log(`${summary} (written locally, not uploaded)`);
} else {
  await r2Put('atlas/night-service.json', JSON.stringify(file));
  console.log(`${summary} -> atlas/night-service.json`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Night service summary\n\n${summary}${dryRun ? ' (not uploaded)' : ''}\n`, { flag: 'a' });
}
