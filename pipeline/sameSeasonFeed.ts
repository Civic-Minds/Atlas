/**
 * CIV-2335: the agency's feed from the same date last year, for the release gate's same-season
 * check. When refresh holds an agency on a red headway-shift, it reads the archived raw zip whose
 * service covered the date one year before today's reading, processes it read at that date, and
 * compares (releaseDiff.sameSeasonMatch). A ski or school timetable that comes back each year then
 * passes by itself; with no archived zip for that date the hold stays as before.
 *
 * Read-only against atlas-archive. Only refresh calls it, in the cloud, where the archive is readable.
 */
import type { R2ObjectInfo } from './r2.js';

/** The same calendar date one year earlier (Feb 29 reads Feb 28). */
export function sameDateLastYear(ymd: string): string {
  const year = Number(ymd.slice(0, 4)) - 1;
  const month = ymd.slice(4, 6);
  let day = ymd.slice(6, 8);
  if (month === '02' && day === '29') day = '28';
  return `${year}${month}${day}`;
}

/** The leading YYYYMMDD of an archived zip's file name (its feed end date), or null for a version name. */
export function archiveKeyEndDate(key: string): string | null {
  const name = key.slice(key.lastIndexOf('/') + 1);
  const m = /^(\d{8})(?:\D|$)/.exec(name);
  if (!m) return null;
  const ymd = m[1];
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? ymd : null;
}

/**
 * The order to try an agency's archived zips for `target`: zips named by an end date before the
 * target are left out (they had ended); dated ones come first, the nearest end date first, then
 * the rest, newest upload first. The main feed's zips only (`gtfs/archive/<slug>/`, not supplementals).
 */
export function sameSeasonCandidates(slug: string, objects: R2ObjectInfo[], target: string): string[] {
  const prefix = `gtfs/archive/${slug}/`;
  const zips = objects.filter(o => o.key.startsWith(prefix) && o.key.endsWith('.zip') && !o.key.slice(prefix.length).includes('/'));
  const dated = zips
    .map(o => ({ key: o.key, end: archiveKeyEndDate(o.key) }))
    .filter((o): o is { key: string; end: string } => o.end != null && o.end >= target)
    .sort((a, b) => a.end.localeCompare(b.end) || a.key.localeCompare(b.key))
    .map(o => o.key);
  const undated = zips
    .filter(o => archiveKeyEndDate(o.key) == null)
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0) || a.key.localeCompare(b.key))
    .map(o => o.key);
  return [...dated, ...undated];
}

/** True when a zip's advertised service (peekFeedDates) covers the target date. */
export function coversDate(dates: { feedStart: string | null; feedExpiry: string | null }, target: string): boolean {
  return !!dates.feedStart && !!dates.feedExpiry && dates.feedStart <= target && target <= dates.feedExpiry;
}
