/**
 * Choosing which archived GTFS zip to reprocess an agency from, and the
 * fail-closed checks around that choice.
 *
 * Archive keys look like `<expiry>-<hash>.zip`, `<expiry>.zip`,
 * `unknown-<date>-<hash>.zip` or a legacy upstream name (`AUG17_3_1.zip`,
 * `en.zip`). Alphabetical order of those names is not recency, so it is never
 * used. Every function here is pure so the rules can be tested without R2.
 */
import JSZip from 'jszip';
import { parseCsv } from './parseGtfs.js';
import { effectiveFeedExpiry, effectiveFeedStart } from './feedFreshness.js';
import { COUNTRY_LAUNCH_FLAG, isCountryLaunchBlocked, resolveAgencyCountry, type AgencyCountrySource } from './countryLaunchGate.js';

export interface ArchiveObject {
  key: string;
  lastModified: Date | null;
  size?: number | null;
}

export type ArchiveSelection =
  | { ok: true; key: string; reason: string }
  | { ok: false; noArchive: boolean; reason: string };

/** Share of live stops/routes a reprocess may lose before it is refused. */
export const MAX_DROP_FRACTION = 0.2;

/** The leading YYYYMMDD service date in an archive key, or null (`unknown-…` and legacy names have none). */
export function archiveKeyServiceDate(key: string): string | null {
  const stem = key.split('/').pop() ?? key;
  const match = /^(\d{8})(?:[-.]|$)/.exec(stem);
  return match ? match[1] : null;
}

function refuse(reason: string): ArchiveSelection {
  return { ok: false, noArchive: false, reason: `cannot tell which archived zip is newest: ${reason}` };
}

/** The single most recently uploaded zip, or null when timestamps are missing or tied. */
function newestUpload(zips: ArchiveObject[]): ArchiveObject | null {
  if (zips.some(obj => !obj.lastModified)) return null;
  const byTime = [...zips].sort((a, b) => b.lastModified!.getTime() - a.lastModified!.getTime());
  const [top, second] = byTime;
  if (second && second.lastModified!.getTime() === top.lastModified!.getTime()) return null;
  return top;
}

/**
 * Pick the archived zip to reprocess an agency from.
 *
 * 1. The most recent upload (R2 LastModified) wins, unless another zip in the
 *    archive carries a later service date in its key. That happens when old
 *    feeds are backfilled or bulk-migrated after the current one was archived
 *    (norta, halifax, path), so upload time stops meaning recency.
 * 2. In that case, or when upload times are missing or tied, fall back to the
 *    latest service date, but only when it matches the expiry of the feed the
 *    live data was built from (`lastFeedExpiry`). Hash variants sharing that
 *    date are ordered by upload time.
 * 3. Anything else is refused rather than guessed. Alphabetical order is never used.
 */
export function selectArchiveForAgency(
  objects: ArchiveObject[],
  agency: { lastFeedExpiry?: string | null },
): ArchiveSelection {
  const zips = objects.filter(obj => obj.key.endsWith('.zip'));
  if (zips.length === 0) return { ok: false, noArchive: true, reason: 'no archived GTFS zip' };
  if (zips.length === 1) return { ok: true, key: zips[0].key, reason: 'only archived zip' };

  const dates = zips.map(obj => archiveKeyServiceDate(obj.key)).filter((date): date is string => date !== null);
  const maxDate = dates.length ? dates.sort().at(-1)! : null;

  const newest = newestUpload(zips);
  if (newest) {
    const newestDate = archiveKeyServiceDate(newest.key);
    if (newestDate === null || maxDate === null || newestDate >= maxDate) {
      return { ok: true, key: newest.key, reason: `newest upload (${newest.lastModified!.toISOString()})` };
    }
  }

  const why = newest
    ? `newest upload ${newest.key} has an older service date than another archived zip (${maxDate})`
    : 'upload times are missing or tied';
  if (!maxDate) return refuse(`${why}, and no zip carries a service date`);
  const liveExpiry = agency.lastFeedExpiry ?? null;
  if (liveExpiry !== maxDate) {
    return refuse(`${why}, and the latest service date ${maxDate} does not match the live feed's ${liveExpiry ?? 'unknown'} expiry`);
  }
  const candidates = zips.filter(obj => archiveKeyServiceDate(obj.key) === maxDate);
  const pick = candidates.length === 1 ? candidates[0] : newestUpload(candidates);
  if (!pick) return refuse(`${why}, and ${candidates.length} zips share service date ${maxDate} with no upload order`);
  return { ok: true, key: pick.key, reason: `latest service date ${maxDate}, matching the live feed (${why})` };
}


export interface FeedDates {
  feedStart: string | null;
  feedExpiry: string | null;
  feedVersion: string | null;
}

/** Read the first and latest advertised service dates and feed_version from a GTFS zip. */
export async function peekFeedDates(buf: Buffer): Promise<FeedDates> {
  try {
    const zip = await JSZip.loadAsync(buf);
    const findEntry = (name: string) => zip.file(name) ?? zip.file(
      Object.keys(zip.files).find(f => f.endsWith(`/${name}`) && !zip.files[f].dir) ?? '',
    );
    const readRows = async (name: string): Promise<Array<Record<string, string>>> => {
      const entry = findEntry(name);
      if (!entry) return [];
      return parseCsv<Record<string, string>>(await entry.async('text'));
    };
    const feedInfo = (await readRows('feed_info.txt'))[0] ?? {};
    const calendar = await readRows('calendar.txt');
    const calendarDates = await readRows('calendar_dates.txt');
    return {
      feedStart: effectiveFeedStart({
        feedInfoStart: feedInfo.feed_start_date,
        calendarStarts: calendar.map(row => row.start_date),
        calendarDates,
      }),
      feedExpiry: effectiveFeedExpiry({
        feedInfoEnd: feedInfo.feed_end_date,
        calendarEnds: calendar.map(row => row.end_date),
        calendarDates,
      }),
      feedVersion: feedInfo.feed_version || null,
    };
  } catch {
    return { feedStart: null, feedExpiry: null, feedVersion: null };
  }
}

/**
 * Refuse a source zip whose service dates are unknown, already over, or older
 * than the feed the live data was built from. Returns a reason, or null if OK.
 */
export function feedDateRefusal(feedExpiry: string | null, liveFeedExpiry: string | null | undefined, todayYmd: string): string | null {
  if (!feedExpiry) return 'source zip has no service dates, so it cannot be shown to be current';
  if (feedExpiry < todayYmd) return `source zip service ended ${feedExpiry}, before today (${todayYmd})`;
  if (liveFeedExpiry && /^\d{8}$/.test(liveFeedExpiry) && feedExpiry < liveFeedExpiry) {
    return `source zip service ends ${feedExpiry}, older than the live data's ${liveFeedExpiry}`;
  }
  return null;
}

export interface ArtifactCounts {
  stops: number;
  stopPoints: number;
  routes: number;
}

/** Count stops.json entries, stop Point features and distinct routes in a route artifact. */
export function countArtifacts(geojson: string, stopsJson: string | null): ArtifactCounts {
  const features = (JSON.parse(geojson) as { features?: Array<{ geometry?: { type?: string } | null; properties?: Record<string, unknown> | null }> }).features ?? [];
  const routes = new Set<string>();
  let stopPoints = 0;
  for (const feature of features) {
    const type = feature.geometry?.type;
    if (type === 'Point') stopPoints++;
    else if ((type === 'LineString' || type === 'MultiLineString') && feature.properties?.routeId != null) {
      routes.add(String(feature.properties.routeId));
    }
  }
  const stops = stopsJson ? Object.keys(JSON.parse(stopsJson) as Record<string, unknown>).length : 0;
  return { stops, stopPoints, routes: routes.size };
}

/**
 * Refuse output that loses more than MAX_DROP_FRACTION of the live stops,
 * stop points or routes. A live count of 0 has nothing to protect.
 */
export function outputDropRefusal(live: ArtifactCounts, next: ArtifactCounts, maxDrop = MAX_DROP_FRACTION): string | null {
  const drops = (Object.keys(live) as Array<keyof ArtifactCounts>)
    .filter(field => live[field] > 0 && next[field] < live[field] * (1 - maxDrop))
    .map(field => `${field} ${live[field]} -> ${next[field]}`);
  return drops.length ? `output would drop sharply against live data (${drops.join(', ')})` : null;
}

/** Count the live route and stops artifacts for an agency, or null when there is no live route artifact. */
export async function readLiveArtifactCounts(
  slug: string,
  get: (key: string) => Promise<string | null>,
): Promise<ArtifactCounts | null> {
  const geojson = await get(`atlas/${slug}.json`);
  if (!geojson) return null;
  return countArtifacts(geojson, await get(`atlas/${slug}-stops.json`));
}

/**
 * The drop guard shared by reprocess and refresh: refuse output that would
 * replace live data with a sharply smaller result unless --allow-drop was
 * passed after review. `allowMissingLive` decides what happens when there is
 * no live artifact to compare against: reprocess refuses (it only rebuilds
 * agencies that are already live), refresh allows it (first publish of a new
 * agency, or rebuilding a missing artifact).
 */
export function dropGuardRefusal(
  live: ArtifactCounts | null,
  next: ArtifactCounts,
  options: { allowDrop: boolean; allowMissingLive: boolean },
): string | null {
  if (options.allowDrop) return null;
  if (!live) {
    return options.allowMissingLive
      ? null
      : 'live artifacts could not be read, so the output cannot be checked for a drop (pass --allow-drop after review)';
  }
  const refusal = outputDropRefusal(live, next);
  return refusal ? `${refusal} (pass --allow-drop after review)` : null;
}

export interface ReprocessCandidate {
  hiddenInProduction?: boolean;
  staged?: boolean;
  pmtilesPending?: boolean;
  lastFeedExpiry?: string | null;
  lastRefreshedAt?: string | null;
}

/**
 * Whether reprocess-derived-artifacts picks up an agency. Hidden agencies are
 * skipped by default; includeHidden (only allowed together with --only-slug)
 * lets a named hidden agency be corrected in R2 while it stays hidden. Staged
 * and pmtilesPending agencies are never picked up.
 */
export function isReprocessTarget(agency: ReprocessCandidate, options: { includeHidden?: boolean } = {}): boolean {
  return !agency.pmtilesPending
    && (!agency.hiddenInProduction || options.includeHidden === true)
    && !agency.staged
    && (!!agency.lastFeedExpiry || !!agency.lastRefreshedAt);
}

/**
 * Reprocess --write skips an agency in a country with zero production-visible
 * agencies (the same rule as process/refresh, #668), unless
 * --i-am-launching-country was passed. Dry runs (no --write) are unaffected.
 */
export function reprocessCountryLaunchSkip(
  agency: AgencyCountrySource,
  registry: AgencyCountrySource[],
  options: { write: boolean; forceLaunch: boolean },
): string | null {
  if (!options.write || options.forceLaunch) return null;
  const country = resolveAgencyCountry(agency);
  return isCountryLaunchBlocked(country, registry)
    ? `unlaunched country: ${country} has no production-visible agencies (pass ${COUNTRY_LAUNCH_FLAG} after explicit maintainer approval)`
    : null;
}

/** --include-hidden must name its agencies, so a full run can never pull in every hidden slug. */
export function includeHiddenArgError(includeHidden: boolean, onlySlugs: string[]): string | null {
  return includeHidden && onlySlugs.length === 0
    ? '--include-hidden requires --only-slug <slug> (it only applies to agencies named explicitly)'
    : null;
}
