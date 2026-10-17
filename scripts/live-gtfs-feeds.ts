/**
 * Which timetable (GTFS feed) a service date belongs to, when the Live analysis is given several (CIV-297).
 *
 * A feed covers the dates in its calendar.txt, from the earliest start_date to the latest end_date. For a date, the
 * feed to use is the one among those covering it that starts latest (the same rule scripts/live-gtfs-for-date.ts
 * uses to pick a zip), so a newer feed wins an overlap. No feed covering a date is an error to report, never a date to
 * drop quietly or to give to a feed that does not cover it. A third feed is just another folder in the list.
 * Pure: no file reads here except `readFeedCoverage`, which takes the CSV reader.
 */
import { basename, join } from 'node:path';
import { existsSync } from 'node:fs';

export interface FeedCoverage {
  /** Short id used to prefix this feed's ids when several feeds are loaded: its feed_version, else its folder name. */
  key: string;
  dir: string;
  version: string | null;
  /** First and last service date the calendar covers, YYYYMMDD. */
  start: string;
  end: string;
}

const ymd = (date: string) => date.replace(/-/g, '');

/** Reads a feed folder's version and the date range its calendar covers. */
export function readFeedCoverage(dir: string, readCsv: (path: string) => Record<string, string>[]): FeedCoverage {
  const calendar = existsSync(join(dir, 'calendar.txt')) ? readCsv(join(dir, 'calendar.txt')) : [];
  const calDates = existsSync(join(dir, 'calendar_dates.txt')) ? readCsv(join(dir, 'calendar_dates.txt')) : [];
  const starts = calendar.map(c => c.start_date).filter(Boolean);
  const ends = calendar.map(c => c.end_date).filter(Boolean);
  // A feed with no calendar rows (service by calendar_dates only) covers the dates it lists.
  const listed = calDates.map(c => c.date).filter(Boolean);
  const start = [...starts, ...listed].sort()[0];
  const end = [...ends, ...listed].sort().slice(-1)[0];
  if (!start || !end) throw new Error(`feed ${dir} has no calendar: it covers no dates`);
  const version = existsSync(join(dir, 'feed_info.txt')) ? readCsv(join(dir, 'feed_info.txt'))[0]?.feed_version || null : null;
  return { key: version ?? basename(dir), dir, version, start, end };
}

/** The feed for a service date (YYYY-MM-DD or YYYYMMDD): the latest-starting one that covers it, or null. */
export function feedForDate(feeds: readonly FeedCoverage[], date: string): FeedCoverage | null {
  const d = ymd(date);
  let best: FeedCoverage | null = null;
  for (const f of feeds) {
    if (f.start > d || f.end < d) continue;
    if (!best || f.start > best.start || (f.start === best.start && f.end > best.end)) best = f;
  }
  return best;
}

/** The dates no feed covers. */
export const uncoveredDates = (feeds: readonly FeedCoverage[], dates: readonly string[]): string[] => dates.filter(d => !feedForDate(feeds, d));

/** Refuses a list of feeds that cannot be told apart (two with the same key). */
export function assertDistinctFeeds(feeds: readonly FeedCoverage[]): void {
  const seen = new Set<string>();
  for (const f of feeds) {
    if (seen.has(f.key)) throw new Error(`two feeds are both called ${f.key} (${f.dir}): give each a different feed_version or folder name`);
    seen.add(f.key);
  }
}

/** A feed's id in the merged timetable: unchanged when only one feed is loaded, else prefixed with the feed's key. */
export const prefixedId = (feeds: readonly FeedCoverage[], feed: FeedCoverage | null, id: string): string => (feeds.length <= 1 ? id : `${feed ? feed.key : 'none'}:${id}`);

/** A one-line description of what each feed covers, for errors and the output file. */
export const describeFeeds = (feeds: readonly FeedCoverage[]): string => feeds.map(f => `${f.key} (${f.start}-${f.end})`).join(', ');

/** One trip's pattern identity for matching shapes across feeds: its feed, shape id, direction and stop sequence. */
export interface TripShape { feed: string; shapeId: string; direction: string; stops: readonly string[] }

/**
 * Several feeds give the same physical pattern a different shape id in each, and patterns are judged by how many trips run
 * them, so a pattern in several feeds must count as one. Within a feed, shapes with the same direction and stop sequence
 * are told apart by how many trips use them (most first, then by id); the k-th of those in one feed is the k-th in another.
 * Each such group takes the id of the newest feed that has it. Returns old shape id -> canonical shape id.
 * `feedKeysOldestFirst` is the feeds in start order.
 */
export function canonicalShapeIds(trips: readonly TripShape[], feedKeysOldestFirst: readonly string[]): Map<string, string> {
  const info = new Map<string, { feed: string; sig: string; trips: number }>();
  for (const t of trips) {
    const i = info.get(t.shapeId) ?? { feed: t.feed, sig: `${t.direction}|${t.stops.join('>')}`, trips: 0 };
    i.trips++;
    info.set(t.shapeId, i);
  }
  const groups = new Map<string, { id: string; trips: number }[]>(); // feed + sig -> shapes, most trips first
  for (const [id, i] of info) { const k = `${i.feed}\u0000${i.sig}`; const l = groups.get(k) ?? []; l.push({ id, trips: i.trips }); groups.set(k, l); }
  for (const l of groups.values()) l.sort((a, b) => b.trips - a.trips || (a.id < b.id ? -1 : 1));
  const canonOf = new Map<string, string>(); // sig#k -> the newest feed's shape id
  for (const feed of [...feedKeysOldestFirst].reverse()) {
    for (const [k, l] of groups) {
      const [f, sig] = k.split('\u0000');
      if (f !== feed) continue;
      l.forEach((sh, n) => { if (!canonOf.has(`${sig}#${n}`)) canonOf.set(`${sig}#${n}`, sh.id); });
    }
  }
  const remap = new Map<string, string>();
  for (const [k, l] of groups) {
    const sig = k.split('\u0000')[1];
    l.forEach((sh, n) => remap.set(sh.id, canonOf.get(`${sig}#${n}`) ?? sh.id));
  }
  return remap;
}
