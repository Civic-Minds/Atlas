#!/usr/bin/env npx tsx
/**
 * CIV-1974: builds Atlas Studio's buses-needed and schedule-change files for every agency in config/studio-builds.json,
 * the files Studio's pages and the Studio MCP read (tmp/studio/<slug>-vehicles.json, tmp/studio/<slug>-before-after.json).
 * Runs in the cloud rebuild before the MCP files are built, so a release carries them without a run on a laptop.
 *
 *   npx tsx scripts/studio-builds.ts [--dry-run] [--out tmp/studio] [--feeds <dir>] [--only ttc,mbta]
 *
 * An agency marked dryRunOnly is built only with --dry-run (the rebuild's dry run), so its files are reported but never
 * published until Ryan OKs its values.
 *
 * Each feed is fetched once: an archived zip from the archive bucket (gtfs/archive/<slug>/<name>.zip, read only) or a
 * MobilityDatabase dataset (public). The builds themselves are scripts/vehicles-needed.ts and scripts/compare-feed-dates.ts,
 * run one at a time. Writes only to --out; nothing goes to R2. Exits 1 when any agency failed (the others are still written).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { studioVehiclesFileName } from '../shared/studioVehicles';

type FeedSource = { archive: string } | { mdb: string };
type Side = { feed: FeedSource; date: string };
type AgencyBuild = { vehicles: { feed: FeedSource; anchor: string }; before: Side; after: Side; dryRunOnly?: boolean };

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const out = resolve(opt('--out') ?? 'tmp/studio');
const feedsDir = resolve(opt('--feeds') ?? join(process.env.RUNNER_TEMP ?? 'tmp', 'studio-feeds'));
const only = opt('--only')?.split(',').filter(Boolean);
const dryRun = args.includes('--dry-run');

const config = JSON.parse(readFileSync('config/studio-builds.json', 'utf8')) as { agencies: Record<string, AgencyBuild> };

/** A MobilityDatabase dataset's public zip: mdb-<feed>-<stamp> lives at files.mobilitydatabase.org/mdb-<feed>/<id>/<id>.zip. */
export const mdbUrl = (id: string): string => `https://files.mobilitydatabase.org/${id.slice(0, id.lastIndexOf('-'))}/${id}/${id}.zip`;
const feedName = (f: FeedSource): string => ('archive' in f ? f.archive : f.mdb);

async function fetchFeed(slug: string, feed: FeedSource): Promise<string> {
  const file = join(feedsDir, slug, `${feedName(feed)}.zip`);
  if (existsSync(file)) return file;
  mkdirSync(join(feedsDir, slug), { recursive: true });
  let body: Buffer | null;
  if ('archive' in feed) {
    const { r2GetArchiveBuffer } = await import('../pipeline/r2');
    body = await r2GetArchiveBuffer(`gtfs/archive/${slug}/${feed.archive}.zip`);
  } else {
    const res = await fetch(mdbUrl(feed.mdb));
    body = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  if (!body) throw new Error(`${slug}: could not fetch ${feedName(feed)}`);
  writeFileSync(file, body);
  return file;
}

function run(script: string, scriptArgs: string[]): void {
  const r = spawnSync('npx', ['tsx', script, ...scriptArgs], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) throw new Error(`${script} exited ${r.status}`);
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const failed: string[] = [];
  for (const [slug, b] of Object.entries(config.agencies)) {
    if (slug.startsWith('_') || (only && !only.includes(slug))) continue;
    if (b.dryRunOnly && !dryRun) { console.log(`studio-builds: ${slug} skipped (dry run only)`); continue; }
    try {
      const vehicles = await fetchFeed(slug, b.vehicles.feed);
      run('scripts/vehicles-needed.ts', [vehicles, '--slug', slug, '--anchor', b.vehicles.anchor, '--json', join(out, studioVehiclesFileName(slug))]);
      const before = await fetchFeed(slug, b.before.feed);
      const after = await fetchFeed(slug, b.after.feed);
      run('scripts/compare-feed-dates.ts', ['--slug', slug, '--before', `${before}@${b.before.date}`, '--after', `${after}@${b.after.date}`, '--json', join(out, `${slug}-before-after.json`)]);
      console.log(`studio-builds: ${slug} done`);
    } catch (e) {
      failed.push(slug);
      console.error(`studio-builds: ${slug} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failed.length) {
    console.error(`studio-builds: failed: ${failed.join(', ')}`);
    reportFailures(failed, dryRun);
    process.exit(1);
  }
}

/**
 * #1874: in the cloud rebuild, name the agencies whose files failed as a warning and on the run summary page. The step
 * runs with continue-on-error, so a log line alone went unseen when every schedule comparison failed in the 2026-11-26 publish.
 */
function reportFailures(failed: string[], dry: boolean): void {
  if (!process.env.GITHUB_ACTIONS) return;
  const line = `Studio files failed to build${dry ? ' (dry run)' : ''} for ${failed.join(', ')}: their schedule changes and buses needed are missing from the MCP files. See the step log.`;
  console.log(`::warning title=Studio files failed::${line}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) writeFileSync(summary, `### Studio files\n\n${line}\n`, { flag: 'a' });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('studio-builds.ts')) await main();
