import { dateRangeText } from './liveDashboard';

/**
 * Approved Live wording used in more than one place (tiles, page subtitles, link previews), kept here so the copies
 * cannot drift apart.
 */

/** The Late tile's caption under its percentage. */
/** The title of every late-by-hour section and card (approved by Ryan 2026-10-17). */
export const LATE_BY_HOUR_TITLE = 'Late departures by hour';
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
/** The Yesterday subtitle's opening, like the week's "Week of Oct 8–14, compared with Oct 1–7": "Thursday, Oct 15, compared with Thursday, Oct 8". */
export const dayComparedWith = (date: string, compareDate: string): string => `${dayText(date)}, compared with ${dayText(compareDate)}`;
export const NOT_ENOUGH_YESTERDAY = 'Not enough recordings yesterday to compare.';

/** The week a page is compared with, after its "Week of": "compared with Oct 1–7". */
export const changesComparedWith = (from: string, to: string): string => `compared with ${dateRangeText(from, to)}`;

/** The end of every Live page subtitle: "estimated from vehicle positions, not reported by the TTC". */
export const estimatedNote = (agency: string): string => `estimated from vehicle positions, not reported by the ${agency.toUpperCase()}`;

/**
 * A Live page subtitle (approved by Ryan): "Week of Oct 8–14, compared with Oct 1–7 · 9 TTC streetcar routes ·
 * estimated from vehicle positions, not reported by the TTC". `middle` is the page's own count (routes or trips);
 * "compared with" only when the two weeks can be compared.
 */
export function liveSubtitle(o: { thisWeek: readonly string[]; lastWeek?: readonly string[] | null; middle: string; agency: string }): string {
  const t = o.thisWeek, l = o.lastWeek;
  const week = t.length ? weekOfText(t[0], t[t.length - 1]) + (l?.length ? `, ${changesComparedWith(l[0], l[l.length - 1])}` : '') : '';
  return [week, o.middle, estimatedNote(o.agency)].filter(Boolean).join(' · ');
}

/** "9 TTC streetcar routes": the routes a page covers, naming the mode only when every one is a streetcar (GTFS route_type 0). */
export function coveredRoutesText(agency: string, routes: ReadonlyArray<{ mode?: number }>): string {
  const streetcar = routes.length > 0 && routes.every(r => r.mode === 0);
  return `${routes.length} ${agency.toUpperCase()} ${streetcar ? 'streetcar ' : ''}route${routes.length === 1 ? '' : 's'}`;
}

/** "Built Oct 16, 6:12 pm", in Toronto time (the agencies Live covers), from an ISO timestamp. */
export function builtText(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso));
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  return `Built ${p('month')} ${p('day')}, ${p('hour')}:${p('minute')} ${p('dayPeriod').toLowerCase()}`;
}

/** The four group labels of "How this is measured", the same on every Live page. */
export const METHOD_GROUPS = {
  numbers: 'What each number means',
  data: 'Where the data comes from',
  colours: 'How changes are coloured',
  limits: 'Limits',
} as const;

/** The recording-gaps limit, said once per page. */
export const RECORDING_GAPS = "days with gaps in our recordings are left out, and trips during those gaps aren't counted.";
