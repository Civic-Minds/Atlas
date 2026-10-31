/**
 * CIV-1223: the daily check for feeds about to run out. Peeks every agency whose recorded schedule (main or
 * supplemental) ends within --days (default 7), plus every rolling feed (nextServiceDatesFeedUrls), and prints the
 * slugs whose new zip ends later than the recorded date. Downloads feeds only: never writes to R2, never dispatches.
 * The daily workflow (.github/workflows/daily-feed-check.yml) passes the slugs to refresh-feeds.yml.
 *
 *   npx tsx scripts/check-expiring-feeds.ts [--index public/data/index.json] [--pending-index <file>]
 *     [--days 7] [--today YYYYMMDD] [--github-output <file>]
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { todayUtcYmd } from '../shared/feedAvailability';
import { checkCandidate, expiringFeedCandidates, type ExpiryCheckAgency } from '../pipeline/feedExpiryCheck';
import { downloadFeed } from '../pipeline/feedPeek';
import { runWithConcurrency } from '../pipeline/utils';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const readAgencies = (path: string): ExpiryCheckAgency[] => (JSON.parse(readFileSync(path, 'utf8')) as { agencies: ExpiryCheckAgency[] }).agencies;

async function main() {
  const agencies = readAgencies(arg('index') ?? 'public/data/index.json');
  const pendingPath = arg('pending-index');
  const pending = pendingPath && existsSync(pendingPath) ? readAgencies(pendingPath) : undefined;
  const candidates = expiringFeedCandidates(agencies, { todayYmd: arg('today') ?? todayUtcYmd(), days: Number(arg('days') ?? 7), pending });
  console.error(`Peeking ${candidates.length} agencies`);
  const results = await runWithConcurrency(candidates.map(c => () => checkCandidate(c, downloadFeed)), 4);
  for (const r of results) {
    const feeds = r.feeds.map(f => `${f.kind} ${f.recorded ?? '-'} -> ${f.peeked ?? (f.error ? `error: ${f.error}` : '-')}`).join(', ');
    console.error(`  ${r.newer ? 'REFRESH' : 'skip   '} ${r.slug.padEnd(22)} ${r.reason} | ${feeds}`);
  }
  const slugs = results.filter(r => r.newer).map(r => r.slug).sort();
  console.error(slugs.length ? `Newer feeds: ${slugs.join(' ')}` : 'No feed is newer: nothing to refresh');
  console.log(slugs.join(' '));
  const out = arg('github-output');
  if (out) appendFileSync(out, `slugs=${slugs.join(' ')}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
