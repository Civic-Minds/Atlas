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
 *    analysis's own rule), and in every other unpacked timetable. A day with positions and no timetable, a match below
 *    --min-share, or another timetable that matches MORE of the day's ids than the chosen one (two TTC feeds share
 *    thousands of trip ids, so a wrong feed can still pass the share) fails the run after the report is written.
 *    A day with no positions at all is reported, not failed: the analysis leaves it out by itself.
 *
 * --agency <slug> (default ttc; CIV-1686): any other agency has no stored surface timetable, so step 2 uses the agency's
 * own static GTFS from the reprocess's archive (gtfs/archive/<slug>/, the zips the pipeline built the map from): newest
 * upload first, each unpacked into --feeds-dir/<zip name>/, until every date of the window is covered or --max-zips
 * (default 10) were read (agencyFeedsForWindow). Dates, service-date bounds and timezone come from the agency
 * (shared/liveAgencyConfig.ts). --surface is optional for it (no agency page reads it). Step 3 is the same.
 *
 * Read-only on R2. Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_ARCHIVE_BUCKET_NAME.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { readCsv } from './live-agency-summary.js';
import { torontoDate, torontoServiceStart } from './live-fetch-archive.js';
import { localDate, localServiceStart } from '../shared/liveAgencyConfig.js';
import { loadLiveAgencyConfig } from './live-agency-config.js';
import { describeFeeds, feedForDate, readFeedCoverage, type FeedCoverage } from './live-gtfs-feeds.js';
import { matchShare, surfaceKeyForDate, tripsTxtIds, unzipTxt } from './live-gtfs-for-date.js';
import { LIVE_SURFACE_PREFIX } from './live-store-surface-gtfs.js';

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Where an agency's service date ends (TTC: 4 a.m. Toronto). */
export interface WindowClock { timeZone: string; serviceDayEndHour: number }

/** The last `n` Toronto (or the agency's local) service dates before the local date of `nowMs`, oldest first. */
export function windowServiceDates(n: number, nowMs: number, clock?: WindowClock): string[] {
  const today = clock ? localDate(nowMs, clock.timeZone) : torontoDate(nowMs);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(addDays(today, -i));
  return out;
}

/**
 * Distinct trip ids the vehicles reported during one service date: snapshots from 4 a.m. Toronto on `date` up to 4 a.m.
 * the next morning. Archive files are named by UTC day, so a service date is the later part of its own file and the
 * early part of the next one. `files` is the archive folder's file names; `read` returns one file's text.
 */
export function serviceDateTripIds(files: readonly string[], read: (file: string) => string, date: string, clock?: WindowClock): Set<string> {
  const start = (d: string) => clock ? localServiceStart(d, clock.timeZone, clock.serviceDayEndHour) : torontoServiceStart(d);
  const from = start(date), to = start(addDays(date, 1));
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

export interface WindowDayMatch {
  date: string; feed: string | null; matched: number; total: number; share: number | null; problem: string | null;
  /** The same day against every other unpacked timetable. */
  others: Array<{ feed: string; matched: number; share: number }>;
}

/**
 * One day's line of the report: the timetable it uses, the share of its live trip ids found there, and the same count
 * for every other timetable. `timetables` is feed key -> its trip ids.
 */
export function dayMatch(date: string, live: Set<string>, feed: FeedCoverage | null, timetables: ReadonlyMap<string, Set<string>>, minShare: number): WindowDayMatch {
  const others = [...timetables].filter(([key]) => key !== feed?.key).map(([key, ids]) => { const m = matchShare(live, ids); return { feed: key, matched: m.matched, share: m.share }; });
  if (live.size === 0) return { date, feed: feed?.key ?? null, matched: 0, total: 0, share: null, problem: null, others: [] };
  const chosen = feed ? timetables.get(feed.key) : undefined;
  if (!feed || !chosen) return { date, feed: null, matched: 0, total: live.size, share: null, problem: 'no stored timetable covers this date', others };
  const { matched, total, share } = matchShare(live, chosen);
  const better = others.filter(o => o.matched > matched).sort((a, b) => b.matched - a.matched)[0];
  const problem = better ? `timetable ${better.feed} matches more of this day (${(better.share * 100).toFixed(1)}%) than the one chosen: wrong timetable for the date`
    : share < minShare ? `below ${(minShare * 100).toFixed(0)}%: the timetable does not match the live feed` : null;
  return { date, feed: feed.key, matched, total, share, problem, others };
}

/** An archived zip of the agency's static GTFS (gtfs/archive/<slug>/<YYYYMMDD>-<hash>.zip). */
export interface ArchivedZip { key: string; lastModified: Date | null }

/**
 * Which of an agency's archived static timetables a window of service dates needs (CIV-1686). Reads zips newest upload
 * first (no upload time: last, by key), keeps each one that covers a date no kept zip covers yet, and stops once every
 * date is covered or `maxZips` were read. `load` unpacks one zip and returns its coverage; `discard` removes one that
 * was read but not kept. Which kept feed a date then uses is the analysis's own rule (feedForDate), checked by the caller.
 */
export async function agencyFeedsForWindow(
  zips: readonly ArchivedZip[], dates: readonly string[], load: (key: string) => Promise<FeedCoverage>,
  discard: (feed: FeedCoverage) => void = () => {}, maxZips = 10,
): Promise<{ feeds: FeedCoverage[]; read: number; uncovered: string[] }> {
  const order = zips.filter(z => z.key.endsWith('.zip')).sort((a, b) =>
    (b.lastModified?.getTime() ?? -Infinity) - (a.lastModified?.getTime() ?? -Infinity) || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  const feeds: FeedCoverage[] = [];
  let uncovered = [...dates];
  let read = 0;
  for (const z of order) {
    if (!uncovered.length || read >= maxZips) break;
    const feed = await load(z.key);
    read++;
    const covers = uncovered.filter(d => feedForDate([feed], d));
    if (!covers.length) { discard(feed); continue; }
    feeds.push(feed);
    uncovered = uncovered.filter(d => !covers.includes(d));
  }
  return { feeds, read, uncovered };
}

async function main() {
  await import('../pipeline/loadEnv.js');
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i] ?? '';
  const days = Number(args.days ?? 15);
  const minShare = Number(args['min-share'] ?? 0.9);
  if (!Number.isInteger(days) || days < 1 || days > 30) { console.error('live-gtfs-window: --days must be a whole number from 1 to 30'); process.exit(2); }
  const agency = args.agency ?? 'ttc';
  if (agency !== 'ttc') return otherAgency(agency, days, minShare, args);
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

  checkAndReport(archiveDir, dates, feeds, tripIds, minShare, args.report);
}

/** Step 3, the same for every agency: each date's match against the timetable it uses; writes --report, exits 1 on a problem. */
function checkAndReport(archiveDir: string, dates: string[], feeds: FeedCoverage[], tripIds: Map<string, Set<string>>, minShare: number, report: string | undefined, clock?: WindowClock): void {
  const files = readdirSync(archiveDir);
  const read = (f: string) => readFileSync(join(archiveDir, f), 'utf8');
  const rows = dates.map(date => {
    const feed = feedForDate(feeds, date);
    return dayMatch(date, serviceDateTripIds(files, read, date, clock), feed, tripIds, minShare);
  });
  for (const r of rows) {
    const share = r.share == null ? (r.total ? 'no timetable' : 'no positions') : `${(r.share * 100).toFixed(1)}%`;
    const rest = r.others.map(o => `${o.feed} ${(o.share * 100).toFixed(1)}%`).join(', ');
    console.log(`live-gtfs-window: ${r.date} ${r.feed ?? '-'} ${r.matched}/${r.total} ${share}${rest ? ` (other: ${rest})` : ''}${r.problem ? `  <-- ${r.problem}` : ''}`);
  }
  const problems = rows.filter(r => r.problem);
  const withPositions = rows.filter(r => r.total > 0).length;
  const ok = problems.length === 0 && withPositions > 0;
  if (report) {
    mkdirSync(resolve(report, '..'), { recursive: true });
    writeFileSync(resolve(report), JSON.stringify({ schema: 1, from: dates[0], to: dates.at(-1), minShare, feeds: feeds.map(f => ({ key: f.key, start: f.start, end: f.end })), days: rows, ok }, null, 2));
  }
  if (!withPositions) { console.error('live-gtfs-window: no archived positions for any date of the window'); process.exit(1); }
  if (problems.length) { console.error(`live-gtfs-window: ${problems.length} day(s) cannot be analysed against the stored timetables (${describeFeeds(feeds)})`); process.exit(1); }
}

/** --agency <slug> other than the TTC: the agency's own archived static GTFS (see the header). */
async function otherAgency(agency: string, days: number, minShare: number, args: Record<string, string>): Promise<void> {
  if (!args['feeds-dir']) { console.error('live-gtfs-window: give --feeds-dir <dir>'); process.exit(2); }
  const live = loadLiveAgencyConfig(agency);
  const clock: WindowClock = { timeZone: live.timeZone, serviceDayEndHour: live.serviceDayEndHour };
  const feedsDir = resolve(args['feeds-dir']);
  const archiveDir = resolve(args.archive ?? join(process.env.LIVE_DATA ?? '../_live-data', `archive-${agency}`));
  const cache = resolve(args.cache ?? join(process.env.RUNNER_TEMP ?? '../_feeds', 'archive-cache'), agency);
  const maxZips = Number(args['max-zips'] ?? 10);
  if (!existsSync(archiveDir)) { console.error(`live-gtfs-window: no archive folder at ${archiveDir}`); process.exit(1); }

  const dates = windowServiceDates(days, Date.now(), clock);
  const { r2GetArchiveBuffer, r2ListArchiveObjects } = await import('../pipeline/r2.js');
  const prefix = `gtfs/archive/${agency}/`;
  const zips = await r2ListArchiveObjects(prefix);
  if (!zips.length) { console.error(`live-gtfs-window: no archived GTFS in ${prefix}`); process.exit(1); }
  mkdirSync(cache, { recursive: true });
  const { feeds, read, uncovered } = await agencyFeedsForWindow(zips, dates, async key => {
    const local = join(cache, basename(key));
    if (!existsSync(local)) {
      const body = await r2GetArchiveBuffer(key);
      if (!body) throw new Error(`could not read ${key}`);
      writeFileSync(local, body);
    }
    const dir = join(feedsDir, basename(key, '.zip'));
    const files = await unzipTxt(readFileSync(local), dir);
    if (!files.includes('trips.txt')) throw new Error(`${key} has no trips.txt`);
    return readFeedCoverage(dir, p => readCsv(readFileSync(p, 'utf8')));
  }, feed => rmSync(feed.dir, { recursive: true, force: true }), maxZips);
  for (const f of feeds) console.log(`live-gtfs-window: ${agency} ${basename(f.dir)} (${f.key}, ${f.start}-${f.end})`);
  console.log(`live-gtfs-window: read ${read} of ${zips.length} archived zips; ${uncovered.length ? `no timetable for ${uncovered.join(', ')}` : 'every date covered'}`);
  if (!feeds.length) { console.error(`live-gtfs-window: no archived ${agency} timetable covers ${dates[0]}..${dates.at(-1)}`); process.exit(1); }
  const tripIds = new Map(feeds.map(f => [f.key, tripsTxtIds(readFileSync(join(f.dir, 'trips.txt'), 'utf8'))] as const));
  if (args.surface) {
    const newest = [...feeds].sort((a, b) => (a.start < b.start ? -1 : 1)).at(-1)!;
    cpSync(newest.dir, resolve(args.surface), { recursive: true });
  }
  checkAndReport(archiveDir, dates, feeds, tripIds, minShare, args.report, clock);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-gtfs-for-window.ts')) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
