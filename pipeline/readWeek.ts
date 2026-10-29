/**
 * The one service-day model's entry point (CIV-1101): the week every reader of a feed's calendar
 * uses. The live map (process-core), phase 1, corridors and converging origins all take their
 * week from here or from the week process-core already picked, so there is one answer per feed.
 *
 * The week comes from pickRiderWeek (serviceDays.ts) and is returned as that week's calendar rows
 * with no calendar_dates, so getActiveServiceIds on the result reads exactly the picked week.
 * ATLAS_LEGACY_REFERENCE_DATE=1 is the kill switch back to the old picker (detectReferenceDate on
 * the feed's own calendar); it stays until the new picker has shipped in a published rebuild
 * (plan stage 7 deletes it).
 */
import type { GtfsCalendar, GtfsCalendarDate, GtfsData } from '../types/gtfs.js';
import { feedVersionDate, pickRiderWeek, serviceAnchor, type RiderWeek } from './serviceDays.js';
import { detectReferenceDate } from './transit-calendar.js';

/** The kill switch back to the old reference-date picker. */
export function legacyReferenceDateEnabled(): boolean {
  return process.env.ATLAS_LEGACY_REFERENCE_DATE === '1';
}

export interface ReadWeek {
  /** Calendar rows to read the week from: the picked week's own rows, or the feed's (legacy). */
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  referenceDate: string;
  /** The picked week; null on the legacy picker. */
  riderWeek: RiderWeek | null;
}

export type ReadWeekFeed = Pick<GtfsData, 'calendar' | 'calendarDates' | 'trips'> & Partial<Pick<GtfsData, 'routes' | 'calendarSynthesized' | 'feedInfo'>>;

/**
 * The week a feed is read at. `anchor` defaults to serviceAnchor() (the run date + 1, Toronto);
 * `fileDate` is when Atlas first obtained the file, for the listing-end safeguard. `legacy`
 * defaults to the kill switch.
 */
export function readWeekOf(
  gtfs: ReadWeekFeed,
  opts: { anchor?: string; fileDate?: string | null; legacy?: boolean } = {},
): ReadWeek {
  const calendar = gtfs.calendar ?? [];
  const calendarDates = gtfs.calendarDates ?? [];
  if (opts.legacy ?? legacyReferenceDateEnabled()) {
    return { calendar, calendarDates, referenceDate: detectReferenceDate(calendar, calendarDates, gtfs.trips), riderWeek: null };
  }
  const riderWeek = pickRiderWeek({
    // The feed's own calendar files, never the calendar parseGtfs synthesizes from calendar_dates.
    calendar: gtfs.calendarSynthesized ? [] : calendar,
    calendarDates,
    trips: gtfs.trips ?? [],
    routes: gtfs.routes ?? [],
    anchor: opts.anchor ?? serviceAnchor(),
    fileDate: [opts.fileDate, feedVersionDate(gtfs.feedInfo?.[0]?.feed_version)].filter((d): d is string => !!d && /^\d{8}$/.test(d)).sort()[0] ?? null,
  });
  return { calendar: riderWeek.calendar, calendarDates: [], referenceDate: riderWeek.referenceDate, riderWeek };
}
