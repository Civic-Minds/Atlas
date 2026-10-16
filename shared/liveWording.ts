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
