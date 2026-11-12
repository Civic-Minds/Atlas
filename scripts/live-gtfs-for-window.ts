/**
 * Get every TTC timetable a window of service dates needs for the Live analysis (CIV-1407), and report how well each
 * day's archived vehicle positions match the timetable that day uses.
 *
 *   npx tsx scripts/live-gtfs-for-window.ts --days 15 --feeds-dir <dir> --surface <dir> --archive <dir>
 *                                           [--report <file.json>] [--cache <dir>] [--min-share 0.9]
 *
 * 1. The window is the last --days Toronto service dates before today (the dates scripts/live-fetch-archive.ts --days fetches).
 * 2. For each date it picks the stored surface zip with the rule scripts/live-gtfs-for-date.ts uses (surfaceKeyForDate),
 *    and unzips each distinct zip into --feeds-dir/<feed start>/, the layout scripts/live-analyze.sh reads when a window
 *    spans a timetable change. The newest one also goes into --surface, which the agency summary reads route names from.
 * 3. For each date it takes the trip ids the vehicles reported during that SERVICE date (4 a.m. to 4 a.m. Toronto, so
 *    two UTC archive files) and counts how many are in the timetable the analysis will use for it (feedForDate, the
 *    analysis's own rule). A day with positions and no timetable, or a match below --min-share, fails the run after the
 *    report is written. A day with no positions at all is reported, not failed: the analysis leaves it out by itself.
 *
 * Read-only on R2. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_ARCHIVE_BUCKET_NAME.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { readCsv } from './live-agency-summary.js';
import { torontoDate, torontoServiceStart } from './live-fetch-archive.js';
import { describeFeeds, feedForDate, readFeedCoverage, type FeedCoverage } from './live-gtfs-feeds.js';
import { matchShare, surfaceKeyForDate, tripsTxtIds, unzipTxt } from './live-gtfs-for-date.js';
import { LIVE_SURFACE_PREFIX } from './live-store-surface-gtfs.js';

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** The last `n` Toronto service dates before the Toronto date of `nowMs`, oldest first. */
export function windowServiceDates(n: number, nowMs: number): string[] {
  const today = torontoDate(nowMs);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(addDays(today, -i));
  return out;
}

/**
 * Distinct trip ids the vehicles reported during one service date: snapshots from 4 a.m. Toronto on `date` up to 4 a.m.
 * the next morning. Archive files are named by UTC day, so a service date is the later part of its own file and the
 * early part of the next one. `files` is the archive folder's file names; `read` returns one file's text.
 */
export function serviceDateTripIds(files: readonly string[], read: (file: string) => string, date: string): Set<string> {
  const from = torontoServiceStart(date), to = torontoServiceStart(addDays(date, 1));
  const ids = new Set<string>();
  for (const day of [date, addDays(date, 1)]) {
    for (const f of files) {
      if (!f.endsWith(`-${day}.jsonl`)) continue;
      for (const line of read(f).split('\n')) {
        if (!line) continue;
        const snap = JSON.parse(line) as { ts?: number; v: unknown[][] };
        if (typeof snap.ts !== 'number' || snap.ts < from || snap.ts >= to) continue;
        for (const v of snap.v) if (typeof v[1] === 'string' && v[1]) ids.add(v[1]);
      }
    }
  }
  return ids;
}

export interface WindowDayMatch { date: string; feed: string | null; matched: number; total: number; share: number | null; problem: string | null }

/** One day's line of the report: the timetable it uses and the share of its live trip ids found there. */
export function dayMatch(date: string, live: Set<string>, feed: FeedCoverage | null, timetableIds: Set<string> | null, minShare: number): WindowDayMatch {
  if (live.size === 0) return { date, feed: feed?.key ?? null, matched: 0, total: 0, share: null, problem: null };
  if (!feed || !timetableIds) return { date, feed: null, matched: 0, total: live.size, share: null, problem: 'no stored timetable covers this date' };
  const { matched, total, share } = matchShare(live, timetableIds);
  return { date, feed: feed.key, matched, total, share, problem: share < minShare ? `below ${(minShare * 100).toFixed(0)}%: the timetable does not match the live feed` : null };
}

async function main() {
  await import('../pipeline/loadEnv.js');
  const { readdirSync } = await import('node:fs');
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i] ?? '';
  const days = Number(args.days ?? 15);
  const minShare = Number(args['min-share'] ?? 0.9);
  if (!Number.isInteger(days) || days < 1 || days > 30) { console.error('live-gtfs-window: --days must be a whole number from 1 to 30'); process.exit(2); }
  if (!args['feeds-dir'] || !args.surface) { console.error('live-gtfs-window: give --feeds-dir <dir> and --surface <dir>'); process.exit(2); }
  const feedsDir = resolve(args['feeds-dir']);
  const surface = resolve(args.surface);
  const archiveDir = resolve(args.archive ?? join(process.env.LIVE_DATA ?? '../_live-data', 'archive'));
  const cache = resolve(args.cache ?? join(process.env.RUNNER_TEMP ?? '../_feeds', 'surface-cache'));
  if (!existsSync(archiveDir)) { console.error(`live-gtfs-window: no archive folder at ${archiveDir}`); process.exit(1); }

  const dates = windowServiceDates(days, Date.now());
  const { r2GetArchiveBuffer, r2ListArchiveObjects } = await import('../pipeline/r2.js');
  const keys = (await r2ListArchiveObjects(LIVE_SURFACE_PREFIX)).map(o => o.key);
  const wanted = [...new Set(dates.map(d => surfaceKeyForDate(keys, d)).filter((k): k is string => !!k))].sort();
  if (!wanted.length) { console.error(`live-gtfs-window: no stored surface GTFS in ${LIVE_SURFACE_PREFIX} starts on or before ${dates.at(-1)}`); process.exit(1); }

  mkdirSync(cache, { recursive: true });
  const feeds: FeedCoverage[] = [];
  const tripIds = new Map<string, Set<string>>();
  for (const key of wanted) {
    const local = join(cache, basename(key));
    if (!existsSync(local)) {
      const body = await r2GetArchiveBuffer(key);
      if (!body) { console.error(`live-gtfs-window: could not read ${key}`); process.exit(1); }
      writeFileSync(local, body);
    }
    const dir = join(feedsDir, basename(key, '.zip'));
    const files = await unzipTxt(readFileSync(local), dir);
    if (!files.includes('trips.txt')) { console.error(`live-gtfs-window: ${key} has no trips.txt`); process.exit(1); }
    const feed = readFeedCoverage(dir, p => readCsv(readFileSync(p, 'utf8')));
    feeds.push(feed);
    tripIds.set(feed.key, tripsTxtIds(readFileSync(join(dir, 'trips.txt'), 'utf8')));
    console.log(`live-gtfs-window: ${key} -> ${dir} (${feed.key}, ${feed.start}-${feed.end})`);
  }
  // The agency summary reads route names from one folder: the newest timetable.
  const newest = [...feeds].sort((a, b) => (a.start < b.start ? -1 : 1)).at(-1)!;
  cpSync(newest.dir, surface, { recursive: true });

  const files = readdirSync(archiveDir);
  const read = (f: string) => readFileSync(join(archiveDir, f), 'utf8');
  const rows = dates.map(date => {
    const feed = feedForDate(feeds, date);
    return dayMatch(date, serviceDateTripIds(files, read, date), feed, feed ? tripIds.get(feed.key) ?? null : null, minShare);
  });
  for (const r of rows) {
    const share = r.share == null ? (r.total ? 'no timetable' : 'no positions') : `${(r.share * 100).toFixed(1)}%`;
    console.log(`live-gtfs-window: ${r.date} ${r.feed ?? '-'} ${r.matched}/${r.total} ${share}${r.problem ? `  <-- ${r.problem}` : ''}`);
  }
  const problems = rows.filter(r => r.problem);
  const withPositions = rows.filter(r => r.total > 0).length;
  const ok = problems.length === 0 && withPositions > 0;
  if (args.report) {
    mkdirSync(resolve(args.report, '..'), { recursive: true });
    writeFileSync(resolve(args.report), JSON.stringify({ schema: 1, from: dates[0], to: dates.at(-1), minShare, feeds: feeds.map(f => ({ key: f.key, start: f.start, end: f.end })), days: rows, ok }, null, 2));
  }
  if (!withPositions) { console.error('live-gtfs-window: no archived positions for any date of the window'); process.exit(1); }
  if (problems.length) { console.error(`live-gtfs-window: ${problems.length} day(s) cannot be analysed against the stored timetables (${describeFeeds(feeds)})`); process.exit(1); }
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-gtfs-for-window.ts')) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
