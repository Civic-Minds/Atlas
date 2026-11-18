/**
 * Per-agency settings for the local Live analysis (scripts/live-fetch-archive.ts, scripts/live-segment-delay.ts),
 * so the same run works for any archived agency (CIV-1683). Pure: the timezone is passed in from
 * config/agencies/<slug>.json by the caller (scripts/live-agency-config.ts loads it).
 *
 * Everything TTC-specific (streetcar carhouses, the Dufferin Gate loop, "Eastbound"-style direction labels) lives in
 * the TTC entry here, not in the scripts. Other agencies get none of it.
 */
import { DEFAULT_LIVE_ARCHIVE_BUCKET, LIVE_ARCHIVE_BUCKET_BY_SLUG } from './rules/live.js';
import { DEFAULT_SERVICE_DAY_END_HOUR } from './rules/periods.js';

/** The default archive bucket: shared/rules/live.ts. */
export { DEFAULT_LIVE_ARCHIVE_BUCKET };

/** GTFS service days run past midnight; a position before this local hour belongs to the previous service date (shared/rules/periods.ts). */
export { DEFAULT_SERVICE_DAY_END_HOUR };

export type LatLon = [number, number];

export interface LiveAgencyExtras {
  /** Places vehicles enter and leave service (TTC streetcar carhouses): standing still nearby is not counted. */
  carhouses?: LatLon[];
  /** Other places where off-shape positions are loop or yard geometry, not diversions (TTC Dufferin Gate loop). */
  notDiversions?: LatLon[];
  /** How a direction is named: TTC headsigns start with the direction word ("East - 504A King ..."). */
  directionLabels?: 'headsignFirstWordBound' | 'mostCommonHeadsign';
  /** Local hour that ends a service date. */
  serviceDayEndHour?: number;
  /** The agency's name in method notes ("the TTC feed has no delay values"). */
  shortName?: string;
}

/** Only agencies that need something non-default are listed. */
export const LIVE_AGENCY_EXTRAS: Readonly<Record<string, LiveAgencyExtras>> = {
  ttc: {
    carhouses: [
      [43.6400, -79.4477], // Roncesvalles
      [43.6655, -79.3205], // Russell
      [43.6620, -79.3300], // Leslie Barns
    ],
    notDiversions: [[43.6337, -79.4246]], // Dufferin Gate loop
    directionLabels: 'headsignFirstWordBound',
    serviceDayEndHour: 4,
    shortName: 'TTC',
  },
  kingston: { shortName: 'Kingston Transit' },
};

export interface LiveAgencyConfig {
  slug: string;
  timeZone: string;
  serviceDayEndHour: number;
  bucket: string;
  /** Archive key prefix for one UTC day: positions/<slug>/<day>/. */
  positionsPrefix: (day: string) => string;
  carhouses: LatLon[];
  notDiversions: LatLon[];
  directionLabels: 'headsignFirstWordBound' | 'mostCommonHeadsign';
  shortName: string;
}

export function liveAgencyConfig(slug: string, timeZone: string | undefined): LiveAgencyConfig {
  if (!timeZone) throw new Error(`live agency ${slug}: no timezone (set "timezone" in config/agencies/${slug}.json)`);
  // Throws on an unknown zone, so a typo fails loudly instead of silently using UTC.
  new Intl.DateTimeFormat('en-CA', { timeZone });
  const x = LIVE_AGENCY_EXTRAS[slug] ?? {};
  const carhouses = x.carhouses ?? [];
  return {
    slug,
    timeZone,
    serviceDayEndHour: x.serviceDayEndHour ?? DEFAULT_SERVICE_DAY_END_HOUR,
    bucket: LIVE_ARCHIVE_BUCKET_BY_SLUG[slug] ?? DEFAULT_LIVE_ARCHIVE_BUCKET,
    positionsPrefix: (day: string) => `positions/${slug}/${day}/`,
    carhouses,
    notDiversions: [...carhouses, ...(x.notDiversions ?? [])],
    directionLabels: x.directionLabels ?? 'mostCommonHeadsign',
    shortName: x.shortName ?? slug,
  };
}

const dateFmts = new Map<string, Intl.DateTimeFormat>();
const hourFmts = new Map<string, Intl.DateTimeFormat>();
function fmt(cache: Map<string, Intl.DateTimeFormat>, timeZone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = cache.get(timeZone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone, ...opts }); cache.set(timeZone, f); }
  return f;
}

/** Local calendar date (YYYY-MM-DD) at an instant (ms). */
export function localDate(ms: number, timeZone: string): string {
  return fmt(dateFmts, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/** Local hour (0-23) at an instant (ms). */
export function localHour(ms: number, timeZone: string): number {
  return Number(fmt(hourFmts, timeZone, { hour: 'numeric', hourCycle: 'h23' }).format(ms));
}

/** Epoch seconds when `hour`:00 local time starts on `day`: the end of the previous service date. */
export function localServiceStart(day: string, timeZone: string, hour: number): number {
  // Offsets are between -14 h and +14 h in whole quarter hours: scan forward, and the first quarter-hour instant that
  // reads `hour` on `day` is when that hour starts.
  const base = Date.parse(`${day}T00:00:00Z`) + hour * 3600_000;
  for (let q = -14 * 4; q <= 14 * 4; q++) {
    const t = base + q * 900_000;
    if (localDate(t, timeZone) === day && localHour(t, timeZone) === hour) return t / 1000;
  }
  throw new Error(`no ${hour}:00 in ${timeZone} on ${day}`);
}
