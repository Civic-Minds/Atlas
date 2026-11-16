#!/usr/bin/env npx tsx
/**
 * CIV-1684: before/after comparison of two versions of an agency's schedule, each read at a fixed date.
 * Local only: reads two GTFS zips, writes tmp/feed-compare/<slug>.{json,md} (tmp/ is gitignored).
 * Nothing goes to R2.
 *
 * Usage:
 *   npx tsx scripts/compare-feed-dates.ts --slug <slug> --before <zip>@<YYYY-MM-DD> --after <zip>@<YYYY-MM-DD>
 *
 * --slug reads config/agencies/<slug>.json (when present) so preprocess and excludes match the map.
 * A date whose service the pipeline does not read (see dateReadProblem in pipeline/feedCompare.ts)
 * stops the run with a message instead of reporting zeros.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { agencyProcessOptions, type AgencyFeedConfig } from '../pipeline/agencyFeeds.js';
import { compareFeedSides, comparisonMarkdown, DateNotReadError, readFeedSide } from '../pipeline/feedCompare.js';
import type { ProcessOptions } from '../pipeline/process-core.js';

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const usage = 'Usage: npx tsx scripts/compare-feed-dates.ts --slug <slug> --before <zip>@<YYYY-MM-DD> --after <zip>@<YYYY-MM-DD>';

function side(value: string | undefined): { zip: string; date: string } {
  const at = value?.lastIndexOf('@') ?? -1;
  if (!value || at <= 0) { console.error(usage); process.exit(1); }
  const zip = value.slice(0, at);
  if (!existsSync(zip)) { console.error(`No such file: ${zip}`); process.exit(1); }
  return { zip, date: value.slice(at + 1) };
}

const slug = option('--slug');
if (!slug) { console.error(usage); process.exit(1); }
const before = side(option('--before'));
const after = side(option('--after'));

const configPath = resolve('config/agencies', `${slug}.json`);
const options: ProcessOptions = existsSync(configPath)
  ? agencyProcessOptions(JSON.parse(readFileSync(configPath, 'utf8')) as AgencyFeedConfig)
  : { slug };

try {
  const b = await readFeedSide(readFileSync(before.zip), before.date, options);
  const a = await readFeedSide(readFileSync(after.zip), after.date, options);
  const cmp = compareFeedSides(slug, { ...b, file: basename(before.zip) }, { ...a, file: basename(after.zip) });
  const dir = resolve('tmp/feed-compare');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${slug}.json`), `${JSON.stringify({ comparison: cmp, before: b, after: a }, null, 1)}\n`);
  const md = comparisonMarkdown(cmp);
  writeFileSync(resolve(dir, `${slug}.md`), `${md}\n`);
  console.log(md);
  console.log(`\nWrote tmp/feed-compare/${slug}.json and .md`);
} catch (err) {
  if (err instanceof DateNotReadError) { console.error(err.message); process.exit(2); }
  throw err;
}
