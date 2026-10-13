/**
 * Weekly list of public agencies whose published timetable has expired.
 *
 * Refresh keeps an agency's last timetable when every feed it knows about has expired (it never
 * blanks an agency), and only marks it stale. Nothing reported that, so 23 agencies sat on old
 * timetables for weeks (#612). The refresh workflow runs this after each refresh and puts the
 * output into one GitHub issue, so each stale agency becomes a to-do: find a newer feed.
 *
 *   npx tsx scripts/report-stale-feeds.ts [--count]   (reads public/data/index.json)
 */
import { readFileSync } from 'node:fs';
import { effectiveFeedExpiry, isStaleProductionFeed, todayUtcYmd, type FeedAvailabilityEntry } from '../shared/feedAvailability';

export interface StaleFeedAgency extends FeedAvailabilityEntry {
  slug: string;
  name?: string;
  region?: string;
  feedUrl?: string | null;
  feedRefreshError?: string | null;
}

export interface StaleFeedRow {
  slug: string;
  name: string;
  region: string;
  expiredOn: string;
  daysExpired: number;
  feedUrl: string | null;
  error: string | null;
}

const ymdToDate = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));

/** Public agencies whose timetable has expired, longest expired first. */
export function staleFeedRows(agencies: StaleFeedAgency[], today = todayUtcYmd()): StaleFeedRow[] {
  return agencies
    .filter(a => isStaleProductionFeed(a, today))
    .map(a => {
      const expiry = effectiveFeedExpiry(a);
      const known = expiry != null && /^\d{8}$/.test(expiry);
      return {
        slug: a.slug,
        name: a.name ?? a.slug,
        region: a.region ?? '',
        expiredOn: known ? `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}` : 'unknown',
        daysExpired: known ? Math.round((ymdToDate(today) - ymdToDate(expiry)) / 86_400_000) : -1,
        feedUrl: a.feedUrl ?? null,
        error: a.feedRefreshError ?? null,
      };
    })
    .sort((x, y) => y.daysExpired - x.daysExpired || x.slug.localeCompare(y.slug));
}

const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The issue body: what to do, then one row per agency. */
export function staleFeedReport(rows: StaleFeedRow[], today = todayUtcYmd()): string {
  const date = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6, 8)}`;
  if (rows.length === 0) return `No public agency is on an expired timetable (checked ${date}).\n`;
  return [
    `${rows.length} public ${rows.length === 1 ? 'agency is' : 'agencies are'} still showing a timetable that has expired (checked ${date}). Refresh keeps the last timetable when every feed it knows about has expired.`,
    '',
    'For each: find a newer feed (agency site, Mobility Database, Transitland), switch `feedUrl`, and refresh it. This list is rewritten after every weekly refresh.',
    '',
    '| Agency | Slug | Expired on | Days | Feed URL | Last refresh note |',
    '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${cell(r.name)}${r.region ? ` (${cell(r.region)})` : ''} | \`${r.slug}\` | ${r.expiredOn} | ${r.daysExpired >= 0 ? r.daysExpired : '?'} | ${r.feedUrl ? cell(r.feedUrl) : 'none'} | ${r.error ? cell(r.error).slice(0, 120) : ''} |`),
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('report-stale-feeds.ts')) {
  const index = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as { agencies: StaleFeedAgency[] };
  const rows = staleFeedRows(index.agencies);
  process.stdout.write(process.argv.includes('--count') ? `${rows.length}\n` : staleFeedReport(rows));
}
