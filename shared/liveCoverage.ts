/**
 * What Atlas Live has recorded for each agency, and so what its reliability figures can and can't say (CIV-1860, Ryan
 * 2026-11-18: "Then just have it mention the limits right now if applicable for each one"). Pure: the caller passes the
 * service dates found in the archive; the release step lists them, and the MCP's Live tools read the result.
 */
import { LIVE_ARCHIVE_POSITION_FEEDS, LIVE_ARCHIVE_TRIP_FEEDS } from './liveArchiveFeeds';
import { LIVE_MIN_HEALTHY_DAYS_PER_WEEK } from './rules/live';
import { HEALTHY_DAY_SHARE } from './routeMetrics';
import { qualityHold, type LiveV3 } from './liveDashboard';

export interface LiveCoverage {
  slug: string;
  /** What is recorded: vehicle positions and/or trip updates. */
  feeds: Array<'vehicle positions' | 'trip updates'>;
  /** Which routes the positions cover: every route, or the listed ones (TTC: streetcars only). */
  routes: 'every route' | string[];
  /** Service dates with recordings still kept, oldest first; null when the archive could not be read. */
  firstDay: string | null;
  lastDay: string | null;
  daysRecorded: number | null;
  /** Whether a day's recordings exist within the last two days (otherwise recording is paused or stopped). */
  recordingNow: boolean | null;
  /** Recorded for Studio only (CIV-1716): its figures reach the hosted MCP through a private bucket, never the public site. */
  archiveOnly: boolean;
}

/** The routes a feed's filter keeps, where it names them (TTC's streetcar filter); 'every route' for a catch-all. */
export function routesRecorded(filterSource: string): 'every route' | string[] {
  if (filterSource === '.+' || filterSource === '.*') return 'every route';
  const re = new RegExp(filterSource);
  const hits: string[] = [];
  for (let n = 1; n < 1000; n++) if (re.test(String(n))) hits.push(String(n));
  return hits.length ? hits : 'every route';
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** One agency's coverage from the dates its archive holds (YYYY-MM-DD), or null dates when they could not be listed. */
export function liveCoverage(slug: string, dates: readonly string[] | null, today: string): LiveCoverage {
  const pos = LIVE_ARCHIVE_POSITION_FEEDS.find(f => f.slug === slug);
  const trip = LIVE_ARCHIVE_TRIP_FEEDS.find(f => f.slug === slug);
  const sorted = dates ? [...new Set(dates)].sort() : null;
  const last = sorted?.at(-1) ?? null;
  return {
    slug,
    feeds: [...(pos ? ['vehicle positions' as const] : []), ...(trip ? ['trip updates' as const] : [])],
    routes: pos ? routesRecorded(pos.routeFilterSource) : 'every route',
    firstDay: sorted?.[0] ?? null,
    lastDay: last,
    daysRecorded: sorted ? sorted.length : null,
    recordingNow: sorted ? last != null && last >= addDays(today, -2) : null,
    archiveOnly: Boolean(pos?.archiveOnly ?? trip?.archiveOnly),
  };
}

/** Every agency Live's archivers know, each once. */
export const LIVE_ARCHIVE_SLUGS: readonly string[] = [...new Set([...LIVE_ARCHIVE_POSITION_FEEDS, ...LIVE_ARCHIVE_TRIP_FEEDS].map(f => f.slug))];

/**
 * Whether a route's Live analysis has enough to state figures: this week has at least LIVE_MIN_HEALTHY_DAYS_PER_WEEK good
 * days and Live's own quality check holds nothing back. The same rule for every agency, so figures switch on (and off)
 * by themselves as recordings build up or lapse.
 */
export function liveFiguresReady(v3: LiveV3 | undefined | null): boolean {
  return !!v3?.weekly && v3.weekly.thisWeek.healthyDates.length >= LIVE_MIN_HEALTHY_DAYS_PER_WEEK && !qualityHold(v3);
}

/** What a good day is, in words, from the shared values. */
export const GOOD_DAY_DEFINITION = `a good day is one with at least ${Math.round(HEALTHY_DAY_SHARE * 100)}% of the recordings a typical day of the same kind has`;

/**
 * The earliest morning figures can appear while recording continues: the first day may be partial, so it counts the next
 * LIVE_MIN_HEALTHY_DAYS_PER_WEEK full days, and the daily build runs the morning after the last of them. Null when not
 * recording or nothing is kept.
 */
export function earliestFiguresDay(c: LiveCoverage): string | null {
  if (!c.firstDay || c.recordingNow !== true) return null;
  return addDays(c.firstDay, LIVE_MIN_HEALTHY_DAYS_PER_WEEK + 1);
}

/** The plain limits an answer states for an agency, from its coverage and how many routes have figures. */
export function coverageLimits(c: LiveCoverage, routesWithFigures: number): string[] {
  const out: string[] = [];
  out.push(c.routes === 'every route' ? `Live records ${c.feeds.join(' and ')} for every route.` : `Live records only routes ${c.routes.join(', ')}.`);
  if (c.daysRecorded == null) out.push('How many days are recorded could not be checked.');
  else if (c.daysRecorded === 0) out.push('No recordings are kept now.');
  else out.push(`Recordings kept: ${c.daysRecorded} service day${c.daysRecorded === 1 ? '' : 's'}, ${c.firstDay} to ${c.lastDay}${c.recordingNow === false ? ' (not recording now)' : ''}.`);
  if (routesWithFigures === 0) {
    out.push(`No figures yet: a route needs at least ${LIVE_MIN_HEALTHY_DAYS_PER_WEEK} good days in the latest week (${GOOD_DAY_DEFINITION}).`);
    const from = earliestFiguresDay(c);
    if (from) out.push(`If every day records well, the earliest figures are on ${from}.`);
  }
  return out;
}
