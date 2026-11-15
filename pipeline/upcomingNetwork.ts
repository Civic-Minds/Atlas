/**
 * CIV-1252: an agency's upcoming network, for the beta network preview (Compare: current vs upcoming).
 *
 * A held, future-dated timetable (#1144: refresh keeps it off the map until it starts) is processed
 * at its own first week, by the same picker and processor as the map, into a separate set of files
 * under atlas/upcoming/ in the STAGING bucket only. Nothing here reads or writes the live release,
 * the catalog (index.json, agency meta), PMTiles, History or the archive. Ryan, 2026-11-03:
 * "1 sure I think" (a separate, beta-only upcoming spot in R2).
 */
import { processAgencyFeeds, type AgencyFeedConfig } from './agencyFeeds.js';
import { peekFeedDates } from './archiveSelection.js';
import { routeLineCount } from './refreshMeta.js';

export const UPCOMING_PREFIX = 'atlas/upcoming';
export const upcomingIndexKey = `${UPCOMING_PREFIX}/index.json`;
export const upcomingRoutesKey = (slug: string) => `${UPCOMING_PREFIX}/${slug}.json`;
export const upcomingStopsKey = (slug: string) => `${UPCOMING_PREFIX}/${slug}-stops.json`;

export interface UpcomingEntry {
  slug: string;
  /** First service date of the upcoming timetable (YYYYMMDD); the UI shows the entry only before it. */
  feedStart: string;
  feedExpiry: string | null;
  feedVersion: string | null;
  /** Where the zip came from (an archive key or a file name). */
  sourceKey: string;
  /** The week read: its reference date and Monday (the map's picker, anchored at feedStart). */
  referenceDate: string;
  serviceWeekStart: string | null;
  routes: number;
  stops: number;
}

export interface UpcomingIndex {
  generatedAt: string;
  agencies: UpcomingEntry[];
}

/** Why this zip is not an upcoming timetable on `todayYmd`, or null. */
export function upcomingRefusal(feedStart: string | null | undefined, todayYmd: string): string | null {
  if (!feedStart || !/^\d{8}$/.test(feedStart)) return 'the zip has no first service date';
  if (feedStart <= todayYmd) return `the timetable already started (${feedStart}, today ${todayYmd}); it is not upcoming`;
  return null;
}

export interface BuiltUpcoming {
  entry: UpcomingEntry;
  /** R2 key -> body, routes and stops (the index is merged separately). */
  files: Map<string, string>;
}

/**
 * Process one held zip as the agency's upcoming network. `agency` is the catalog entry, read only.
 * Throws when the zip is not upcoming, the agency has supplemental feeds (their next zips are not
 * held with it), or the output has no route lines.
 */
export async function buildUpcoming(buf: Buffer, agency: AgencyFeedConfig & { excludeRouteShortNames?: string[] }, opts: { todayYmd: string; sourceKey: string; onProgress?: (m: string) => void }): Promise<BuiltUpcoming> {
  if ((agency.supplementalFeedUrls?.length ?? 0) > 0) throw new Error(`${agency.slug}: agencies with supplemental feeds are not supported yet (their upcoming zips are not held together)`);
  const dates = await peekFeedDates(buf, agency.excludeRouteShortNames);
  const refusal = upcomingRefusal(dates.feedStart, opts.todayYmd);
  if (refusal) throw new Error(`${agency.slug}: ${refusal}`);
  const feedStart = dates.feedStart!;
  const result = await processAgencyFeeds(buf, [], { ...agency, supplementalFeedUrls: [] }, { serviceAnchor: feedStart }, opts.onProgress);
  const routes = routeLineCount(result.geojson);
  if (routes === 0) throw new Error(`${agency.slug}: the upcoming timetable has no route lines in its first week`);
  const stops = Object.keys(JSON.parse(result.stopsJson)).length;
  return {
    entry: {
      slug: agency.slug,
      feedStart,
      feedExpiry: result.feedExpiry ?? dates.feedExpiry ?? null,
      feedVersion: result.feedVersion,
      sourceKey: opts.sourceKey,
      referenceDate: result.referenceDate,
      serviceWeekStart: result.serviceWeekStart,
      routes,
      stops,
    },
    files: new Map([[upcomingRoutesKey(agency.slug), result.geojson], [upcomingStopsKey(agency.slug), result.stopsJson]]),
  };
}

/** The index after adding `entry`: replaces the slug's old entry and drops entries that have started. */
export function mergeUpcomingIndex(existing: UpcomingIndex | null, entry: UpcomingEntry, todayYmd: string, generatedAt: string): UpcomingIndex {
  const kept = (existing?.agencies ?? []).filter(a => a.slug !== entry.slug && a.feedStart > todayYmd);
  return { generatedAt, agencies: [...kept, entry].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)) };
}
