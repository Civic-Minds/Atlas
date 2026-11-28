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
/**
 * vehicles.feed and anchor are a fallback: buses needed reads the feed the map's current release processed (the
 * agency's lastRawArchiveKey) unless `pinned` holds it on purpose (CIV-3172).
 */
type AgencyBuild = { vehicles: { feed: FeedSource; anchor: string; pinned?: boolean }; before: Side; after: Side; dryRunOnly?: boolean };

/**
 * CIV-3172 (Ryan, "1"): the feed buses needed reads. The map's current feed (config/agencies/<slug>.json's
 * lastRawArchiveKey, archived at gtfs/archive/<slug>/) with today's rider week, so Fleet never lags the map; the pinned
 * feed and anchor only where the build says `pinned`, or where the agency has no recorded feed.
 */
export function vehiclesSource(slug: string, b: Pick<AgencyBuild, 'vehicles'>, agencyConfig: { lastRawArchiveKey?: string | null } | null): { feed: FeedSource; anchor: string | null; current: boolean } {
  if (!b.vehicles.pinned && agencyConfig?.lastRawArchiveKey) return { feed: { archive: agencyConfig.lastRawArchiveKey }, anchor: null, current: true };
  return { feed: b.vehicles.feed, anchor: b.vehicles.anchor, current: false };
}
const agencyConfigOf = (slug: string) => (existsSync(`config/agencies/${slug}.json`) ? JSON.parse(readFileSync(`config/agencies/${slug}.json`, 'utf8')) as { lastRawArchiveKey?: string | null } : null);

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
      const source = vehiclesSource(slug, b, agencyConfigOf(slug));
      const vehicles = await fetchFeed(slug, source.feed);
      // Without --anchor, vehicles-needed reads today's rider week, the one the current feed covers.
      run('scripts/vehicles-needed.ts', [vehicles, '--slug', slug, ...(source.anchor ? ['--anchor', source.anchor] : []), '--json', join(out, studioVehiclesFileName(slug))]);
      console.log(`studio-builds: ${slug} buses needed from ${feedName(source.feed)}${source.current ? ' (the map\'s current feed)' : ' (pinned)'}`);
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
