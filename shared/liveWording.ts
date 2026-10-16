import { dateRangeText } from './liveDashboard';

/**
 * Approved Live wording used in more than one place (tiles, page subtitles, link previews), kept here so the copies
 * cannot drift apart.
 */

/** The Late tile's caption under its percentage. */
export const LATE_TILE_CAPTION = 'of trips left the end of the line more than 5 min late';

/** The week a page's figures cover, as its subtitle opens: "Week of Oct 8–14". */
export const weekOfText = (from: string, to: string): string => `Week of ${dateRangeText(from, to)}`;

/** The hover line of a late-by-hour chart (approved by Ryan), by the hour trips start: "2 pm: 8 of 167 trips left the end of the line late". */
export const lateHourLine = (clock: string, late: number, total: number): string => `${clock}: ${late.toLocaleString()} of ${total.toLocaleString()} trips left the end of the line late`;

/** Late departures in an hour, from its late share and its count (the share is that count over the total). */
export const lateCount = (share: number, total: number): number => Math.round(share * total);

/** The route strip's stop hover (CIV-281, approved by Ryan): "Usually 1.7 min early · 12% late", "7% bunched · 5% too long". */
export const USUALLY_ON_TIME = 'Usually on time';
export const usuallyOffBy = (minutes: string, side: 'early' | 'late'): string => `Usually ${minutes} min ${side}`;
export const lateShareText = (pct: string): string => `${pct} late`;
export const bunchedAndLong = (bunched: string, tooLong: string): string => `${bunched} bunched · ${tooLong} too long`;

/** The Yesterday view (CIV-278, wording approved by Ryan). */
export const PERIOD_PILLS = { week: 'This week', yesterday: 'Yesterday' } as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayOf = (date: string): string => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
/** "Thursday, Oct 15": a single day where the weekly view says "Week of Oct 8–14". */
export const dayText = (date: string): string => `${weekdayOf(date)}, ${dateRangeText(date, date)}`;
/** A tile's change line against the same weekday a week before: "▲ from 9% last week" becomes "▲ from 9% last Thursday". */
export const againstLastWeekday = (line: string, compareDate: string): string => line.replace(/last week$/, `last ${weekdayOf(compareDate)}`);
export const changesComparedWithSameDay = (compareDate: string): string => `Changes compared with the same day last week (${dayText(compareDate)})`;
export const NOT_ENOUGH_YESTERDAY = 'Not enough recordings yesterday to compare.';
