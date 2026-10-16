import { dateRangeText } from './liveDashboard';

/**
 * Approved Live wording used in more than one place (tiles, page subtitles, link previews), kept here so the copies
 * cannot drift apart.
 */

/** The Late tile's caption under its percentage. */
export const LATE_TILE_CAPTION = 'of departures left more than 5½ min late';

/** The week a page's figures cover, as its subtitle opens: "Week of Oct 8–14". */
export const weekOfText = (from: string, to: string): string => `Week of ${dateRangeText(from, to)}`;

/** The hover line of a late-by-hour chart (approved by Ryan): "2 pm: 8 of 167 timed stops left late". */
export const lateHourLine = (clock: string, late: number, total: number): string => `${clock}: ${late.toLocaleString()} of ${total.toLocaleString()} timed stops left late`;

/** Late departures in an hour, from its late share and its count (the share is that count over the total). */
export const lateCount = (share: number, total: number): number => Math.round(share * total);
