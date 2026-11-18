/**
 * The one service-day model's entry point (CIV-1101): the week every reader of a feed's calendar
 * uses. The live map (process-core), phase 1, corridors and converging origins all take their
 * week from here or from the week process-core already picked, so there is one answer per feed.
 *
 * The week comes from pickRiderWeek (serviceDays.ts) and is returned as that week's calendar rows
 * with no calendar_dates, so getActiveServiceIds on the result reads exactly the picked week.
 */
import type { GtfsCalendar, GtfsCalendarDate, GtfsData } from '../types/gtfs.js';
import { feedVersionDate, pickRiderWeek, serviceAnchor, type RiderWeek } from './serviceDays.js';

export interface ReadWeek {
  /** Calendar rows to read the week from: the picked week's own rows. */
  calendar: GtfsCalendar[];
  calendarDates: GtfsCalendarDate[];
  referenceDate: string;
  /** The picked week. */
  riderWeek: RiderWeek;
}

export type ReadWeekFeed = Pick<GtfsData, 'calendar' | 'calendarDates' | 'trips'> & Partial<Pick<GtfsData, 'routes' | 'calendarSynthesized' | 'feedInfo'>>;

/**
 * The week a feed is read at. `anchor` defaults to serviceAnchor() (the run date + 1, Toronto);
 * `fileDate` is when Atlas first obtained the file, for the listing-end safeguard.
 */
export function readWeekOf(
  gtfs: ReadWeekFeed,
  opts: { anchor?: string; fileDate?: string | null } = {},
): ReadWeek {
  const calendar = gtfs.calendar ?? [];
  const calendarDates = gtfs.calendarDates ?? [];
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
