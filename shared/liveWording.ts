import { dateRangeText } from './liveDashboard';
import { clockTime } from './timeText';

/**
 * Approved Live wording used in more than one place (tiles, page subtitles, link previews), kept here so the copies
 * cannot drift apart.
 */

/** The Late tile's caption under its percentage. */
/** What Late means, once, for every page, panel and the glossary (approved by Ryan 2026-10-17). Reads after "Late:". */
export const LATE_DEFINITION = "more than 5½ min behind the timetable: the TTC's 5-minute standard, plus 30 seconds because we see each vehicle about once a minute.";
/** The title of every late-by-hour section and card (approved by Ryan 2026-10-17). */
export const LATE_BY_HOUR_TITLE = 'Late departures by hour';
/** The threshold in one phrase, wherever a caption or intro says how late counts as Late (approved by Ryan 2026-10-17). */
export const LATE_THRESHOLD = 'more than 5½ min late';
/** The short line for the tool's left panel and tile maths: the threshold and where it comes from. */
export const LATE_SHORT = `${LATE_THRESHOLD} (TTC's 5-min standard + 30 s)`;
export const LATE_TILE_CAPTION = `of trips left the end of the line ${LATE_THRESHOLD}`;

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
/** A tile's change line against the same weekday a week before: "last week 9%" becomes "last Thursday 9%" ("same as last week" likewise). */
export const againstLastWeekday = (line: string, compareDate: string): string => line.replace(/last week/, `last ${weekdayOf(compareDate)}`);
/** The Yesterday subtitle's opening, like the week's "Week of Oct 8–14, compared with Oct 1–7": "Thursday, Oct 15, compared with Thursday, Oct 8". */
export const dayComparedWith = (date: string, compareDate: string): string => `${dayText(date)}, compared with ${dayText(compareDate)}`;
export const NOT_ENOUGH_YESTERDAY = 'Not enough recordings yesterday to compare.';

/** The week a page is compared with, after its "Week of": "compared with Oct 1–7". */
export const changesComparedWith = (from: string, to: string): string => `compared with ${dateRangeText(from, to)}`;

/** The end of every Live page subtitle: "estimated from vehicle positions, not reported by the TTC". */
export const estimatedNote = (agency: string): string => `estimated from vehicle positions, not reported by the ${agency.toUpperCase()}`;

/**
 * A Live page subtitle (approved by Ryan): "Week of Oct 8–14, compared with Oct 1–7 · 9 TTC streetcar routes ·
 * estimated from vehicle positions, not reported by the TTC · data up to Oct 14". `middle` is the page's own count (routes or trips);
 * "compared with" only when the two weeks can be compared.
 */
export function liveSubtitle(o: { thisWeek: readonly string[]; lastWeek?: readonly string[] | null; middle: string; agency: string; /** The newest day in the figures (YYYY-MM-DD): ends the line as "data up to Oct 14". */ upTo?: string | null }): string {
  const t = o.thisWeek, l = o.lastWeek;
  const week = t.length ? weekOfText(t[0], t[t.length - 1]) + (l?.length ? `, ${changesComparedWith(l[0], l[l.length - 1])}` : '') : '';
  return [week, o.middle, estimatedNote(o.agency), o.upTo ? `data up to ${dateRangeText(o.upTo, o.upTo)}` : ''].filter(Boolean).join(' · ');
}

/** "9 TTC streetcar routes": the routes a page covers, naming the mode only when every one is a streetcar (GTFS route_type 0). */
export function coveredRoutesText(agency: string, routes: ReadonlyArray<{ mode?: number }>): string {
  const streetcar = routes.length > 0 && routes.every(r => r.mode === 0);
  return `${routes.length} ${agency.toUpperCase()} ${streetcar ? 'streetcar ' : ''}route${routes.length === 1 ? '' : 's'}`;
}

/** "Built Oct 16, 6:12 PM", in Toronto time (the agencies Live covers), from an ISO timestamp. */
export function builtText(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  return `Built ${p('month')} ${p('day')}, ${clockTime(Number(p('hour')) * 60 + Number(p('minute')))}`;
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

/** Run time against the timetable in whole minutes: "2 min faster than the timetable" (the tile's caption), or without the tail in a table cell. */
export const runTimeDiffText = (diffMin: number, tail = true): string => (diffMin === 0 ? 'same as the timetable' : `${Math.abs(diffMin)} min ${diffMin < 0 ? 'faster' : 'slower'}${tail ? ' than the timetable' : ''}`);

/** A rise in a share, in percentage points: "+31 pt" (the unit the tiles use for a change in a share). */
export const risePointsText = (rise: number): string => `${rise > 0 ? '+' : ''}${Math.round(rise * 100)} pt`;

/**
 * Bunching as whole percents that add up wherever a total and its two parts sit side by side (tile, route list, agency
 * table, strip): the total is rounded first, then the too-close part, and the too-far-apart part is what remains of the
 * total. Without the parts, the whole is the too-close part.
 */
export function bunchTotalParts(share: number, bunched?: number | null, gapped?: number | null): { total: number; bunched: number; tooLong: number } {
  const total = Math.round(share * 100);
  if (bunched == null || gapped == null) return { total, bunched: total, tooLong: 0 };
  const close = Math.min(total, Math.round(bunched * 100));
  return { total, bunched: close, tooLong: total - close };
}

/** "14% · 8%": the two parts, adding up to the total shown anywhere else. */
export const bunchPartsText = (share: number, bunched: number, gapped: number): string => { const p = bunchTotalParts(share, bunched, gapped); return `${p.bunched}% · ${p.tooLong}%`; };

/**
 * The days left out of a figure, named: "Excluding Oct 13, 14" (same month: the month once), "Excluding Oct 30, Nov 1"
 * (across months). Null when nothing is left out, so a page shows nothing at all when every day counts.
 */
export function excludingText(dates: readonly string[]): string | null {
  const days = [...new Set(dates)].sort();
  if (!days.length) return null;
  let month = '';
  const parts = days.map(d => {
    const [m, day] = dateRangeText(d, d).split(' ');
    const out = m === month ? day : `${m} ${day}`;
    month = m;
    return out;
  });
  return `Excluding ${parts.join(', ')}`;
}

/** The days of an "Excluding" label without the word: "Oct 13, 14". */
const leftOutList = (dates: readonly string[]): string => (excludingText(dates) ?? '').replace(/^Excluding /, '');

/** The hover reason, naming the days: "Oct 11 left out: gaps in our recordings that day" ("…those days" for several). Null when none. */
export function leftOutReason(dates: readonly string[]): string | null {
  const days = [...new Set(dates)];
  return days.length ? `${leftOutList(days)} left out: gaps in our recordings ${days.length > 1 ? 'those days' : 'that day'}` : null;
}

/**
 * Where this week and last week are compared: "Excluding Oct 11 this week, Oct 4 last week" (only the week that left days
 * out is named). Null when every day of both weeks counted.
 */
export function excludingWeeksText(thisWeek: readonly string[], lastWeek: readonly string[]): string | null {
  const t = leftOutList(thisWeek), l = leftOutList(lastWeek);
  if (t && l) return `Excluding ${t} this week, ${l} last week`;
  if (t) return `Excluding ${t} this week`;
  if (l) return `Excluding ${l} last week`;
  return null;
}
