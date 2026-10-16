import { dateRangeText } from './liveDashboard';

/**
 * Approved Live wording used in more than one place (tiles, page subtitles, link previews), kept here so the copies
 * cannot drift apart.
 */

/** The Late tile's caption under its percentage. */
export const LATE_TILE_CAPTION = 'of departures left more than 5½ min late';

/** The week a page's figures cover, as its subtitle opens: "Week of Oct 8–14". */
export const weekOfText = (from: string, to: string): string => `Week of ${dateRangeText(from, to)}`;

/** A tile's change line with last week's value as the tile writes it: "down from 10% last week", "up from 5% faster last week". */
export const changeFromLastWeek = (direction: 'up' | 'down', lastText: string): string => `${direction} from ${lastText} last week`;

/** A tile's change line when nothing moved. */
export const SAME_AS_LAST_WEEK = 'same as last week';

/** The one line by the tiles: "Changes compared with the week before (Oct 1–7)". */
export const changesComparedWith = (lastWeekRange: string): string => `Changes compared with the week before (${lastWeekRange})`;
