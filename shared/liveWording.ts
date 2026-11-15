import { agencyInSentence } from './agencyArticle';
import { dateRange } from './dateText';
import { clockTime } from './timeText';
import { countOf, plural } from './overflowText';
import { countText } from './numberText';

/**
 * Approved Live wording used in more than one place (tiles, page subtitles, link previews), kept here so the copies
 * cannot drift apart.
 */

/** What Late means, once, for every page, panel and the glossary (approved by Ryan 2026-10-17). Reads after "Late:". */
/** The route strip's delay legend (E22, Ryan, CIV-1075): "Typical delay: 1+ min ahead · On time · 1–3 min · 3+ min behind". The early step shows only when a stop is ahead. */
/** The name of how long a trip takes end to end, on Live and the map alike (Ryan, CIV-1160 question 6, 2026-11-13: "Trip time", not "Run time"). */
export const TRIP_TIME_LABEL = 'Trip time';
export const DELAY_LEGEND_TITLE = 'Typical delay';

// The names of Live's measures and sections, each written once (CIV-1596). Every page, panel, table and glossary reads
// these; the style guard fails on a copy typed by hand in Live code.
/** The share of departures more than 5½ min behind: tile, column, map measure and glossary term. */
export const LATE_LABEL = 'Late';
/** The extra minutes riders wait beyond the scheduled gap: tile, section, map measure and glossary term. */
export const EXTRA_WAIT_LABEL = 'Extra wait';
/** The share of gaps too short or too long: tile, column, map measure and glossary term. */
export const BUNCHING_LABEL = 'Bunching';
/** The share of scheduled trips that ran, in a narrow column and the glossary. */
export const DELIVERED_LABEL = 'Delivered';
/** The same share as a tile, section title and sort choice. */
export const SERVICE_DELIVERED_TITLE = 'Service delivered';
/** The late-stops section and widget on the agency and route pages. */
export const LATE_STOPS_TITLE = 'Stops most often late';
/** The week table's section and caption. */
export const WEEK_COMPARE_TITLE = 'This week compared with last week';
/** The bunching section. */
export const BUNCHING_FORMS_TITLE = 'Where bunching forms';
/** The route strip's section. */
export const ALONG_ROUTE_TITLE = 'Along the route';
/** The share of trips in which a stretch's delay grows. */
export const GROWS_LABEL = 'Trips where it grows';
/** The stretch that adds the most minutes, in the delay build-up section. */
export const ADDS_MOST_TITLE = 'Stretch that adds the most';
/** The by-hour part of the bunching and build-up sections. */
export const BY_TIME_OF_DAY_TITLE = 'By time of day';

// Live words used in more than one place, each written once (CIV-1601).
/** "Not measured": a key entry, a link verdict, a map mark with no figure. */
export const NOT_MEASURED_LABEL = 'Not measured';
/** "not measured": the same, as a value inside a table cell or sentence. */
export const NOT_MEASURED_VALUE = 'not measured';
/** A stop with no delay figure, in its hover and card. */
export const DELAY_NOT_MEASURED = 'Delay not measured';
/** A chart or strip mark resting on sparse location reports. */
export const LESS_EXACT_LABEL = 'Less exact';
/** The 90th-percentile delay column and figure. */
export const P90_LATER_LABEL = '1 in 10 later than';
/** The back link from a report page to the Live map app. */
export const OPEN_LIVE_LABEL = 'Open Live';
/** The link from a report page to the same route or agency on the Live map. */
export const VIEW_ON_LIVE_MAP = 'View on Live map';
/** The direction pills' choice for both directions together. */
export const BOTH_DIRECTIONS_LABEL = 'Both directions';
/** The direction pills, table column and vehicle card row. */
export const DIRECTION_LABEL = 'Direction';
/** The period picker's label. */
export const TIME_OF_DAY_LABEL = 'Time of day';
/** The heading over what a stretch is linked to, and its glossary term. */
export const LINKED_TO_TITLE = 'Linked to';
/** A link verdict: measured in the same stretch, or not. */
export const LINKED_LABEL = 'Linked';
export const NOT_LINKED_LABEL = 'Not linked';
/** A trip that ends before the line's end: a vehicle card tag and a trip pattern's kind. */
export const SHORT_TURN_LABEL = 'Short turn';
/** The two kinds of bunching gap, in charts, legends and figures. */
export const TOO_CLOSE_LABEL = 'Too close together';
export const TOO_FAR_LABEL = 'Too far apart';
/** The share of gaps too short or too long, as a figure and column. */
export const GAPS_OFF_SCHEDULE_LABEL = 'Gaps off the schedule';
export const EARLY_STEP_LABEL = '1+ min ahead';
/** "behind", not "late": Late means more than 5½ min (E9); "behind" only on the last step (E22). */
/** A vehicle or stop on schedule; the delay legend's first step (CIV-1601). */
export const ON_TIME_LABEL = 'On time';
export const DELAY_STEP_LABELS = [ON_TIME_LABEL, '1–3 min', '3+ min behind'] as const;

export const LATE_DEFINITION = "is more than 5½ min behind schedule. This is based on the TTC’s 5-minute standard, plus 30 seconds because we only record each vehicle’s location once a minute.";
/** The title of every late-by-hour section and card (approved by Ryan 2026-10-17). */
export const LATE_BY_HOUR_TITLE = 'Late departures by hour';
/** The threshold in one phrase, wherever a caption or intro says how late counts as Late (approved by Ryan 2026-10-17). */
export const LATE_THRESHOLD = 'more than 5½ min late';

/** The title of every "Where delays start" section and the name of the stretch it marks (one name, CIV-1448). */
export const DELAY_STARTS_TITLE = 'Where delays start';
/** The column and figure label for the typical minutes a stretch adds (CIV-1448). */
export const TYPICAL_ADDED = 'Typical added';

/**
 * The line under "Stops most often late", the same on the agency page and the route's Full analysis (CIV-1448):
 * "The 10 stops where vehicles most often leave more than 5½ min late, Oct 8–14, across all analysed routes." on the
 * agency page; "… late (stops with 30+ departures)." on a route. With no dates, the days are left out.
 */
export const lateStopsIntro = (count: number, o: { scope: 'agency' | 'route'; dates?: readonly string[] }): string => {
  const d = o.dates ?? [];
  const days = d.length ? `, ${dateRange(d[0], d[d.length - 1])}` : '';
  return `The ${countOf(count, 'stop')} where vehicles most often leave ${LATE_THRESHOLD}${days}${o.scope === 'agency' ? ', across all analysed routes' : ' (stops with 30+ departures)'}.`;
};

/** The faded-mark note under a chart, one sentence everywhere (CIV-1448): "Paler bars rest on fewer than 30 trips." */
export const fadedNoteText = (minN: number, unit: string, marks: 'bars' | 'dots' = 'bars'): string => `Paler ${marks} rest on fewer than ${minN} ${unit}.`;

/** The Late tile's caption under its percentage. */
export const LATE_TILE_CAPTION = `of trips left the end of the line ${LATE_THRESHOLD}`;

/** The week a page's figures cover, as its subtitle opens: "Week of Oct 8–14". */
export const weekOfText = (from: string, to: string): string => `Week of ${dateRange(from, to)}`;

/** The hover line of a late-by-hour chart (approved by Ryan), by the hour trips start: "2 PM: 8 of 167 trips left the end of the line late". */
export const lateHourLine = (clock: string, late: number, total: number): string => `${clock}: ${countText(late)} of ${countText(total)} trips left the end of the line late`;

/** Late departures in an hour, from its late share and its count (the share is that count over the total). */
export const lateCount = (share: number, total: number): number => Math.round(share * total);

/** The route strip's stop hover (CIV-281, approved by Ryan): "Usually 1.7 min early · 12% late", "7% bunched · 5% too long". */
export const USUALLY_ON_TIME = 'Usually on time';
export const usuallyOffBy = (minutes: string, side: 'early' | 'late'): string => `Usually ${minutes} min ${side}`;
export const lateShareText = (pct: string): string => `${pct} late`;
export const bunchedAndLong = (bunched: string, tooLong: string): string => `${bunched} bunched · ${tooLong} too long`;

/** The Yesterday view (CIV-278, wording approved by Ryan). */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayOf = (date: string): string => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
/** "Thursday, Oct 15": a single day where the weekly view says "Week of Oct 8–14". */
export const dayText = (date: string): string => `${weekdayOf(date)}, ${dateRange(date, date)}`;
/** A tile's change line against the same weekday a week before: "last week 9%" becomes "last Thursday 9%" ("same as last week" likewise). */
export const againstLastWeekday = (line: string, compareDate: string): string => line.replace(/last week/, `last ${weekdayOf(compareDate)}`);
export const NOT_ENOUGH_YESTERDAY = 'Not enough recordings yesterday to compare.';

/** The week a page is compared with, after its "Week of": "compared with Oct 1–7". */
export const changesComparedWith = (from: string, to: string): string => `compared with ${dateRange(from, to)}`;

/**
 * The end of every Live page subtitle: "estimated from vehicle positions, not reported by the TTC" ("by MiWay": the agency's
 * short name, with "the" only where the CIV-1103 rule gives it, #1474 / CIV-1474).
 */
export const estimatedNote = (agencyName: string): string => `estimated from vehicle positions, not reported by ${agencyInSentence(agencyName)}`;

/**
 * A Live page subtitle (approved by Ryan): "Week of Oct 8–14, compared with Oct 1–7 · 9 TTC routes ·
 * estimated from vehicle positions, not reported by the TTC · data up to Oct 14". `middle` is the page's own count (routes or trips);
 * "compared with" only when the two weeks can be compared.
 */
export function liveSubtitle(o: { thisWeek: readonly string[]; lastWeek?: readonly string[] | null; middle: string; /** The agency's short name ("TTC", "MiWay"). */ agency: string; /** The newest day in the figures (YYYY-MM-DD): ends the line as "data up to Oct 14". */ upTo?: string | null }): string {
  const t = o.thisWeek, l = o.lastWeek;
  const week = t.length ? weekOfText(t[0], t[t.length - 1]) + (l?.length ? `, ${changesComparedWith(l[0], l[l.length - 1])}` : '') : '';
  return [week, o.middle, estimatedNote(o.agency), o.upTo ? `data up to ${dateRange(o.upTo, o.upTo)}` : ''].filter(Boolean).join(' · ');
}

/**
 * "9 TTC routes": the routes a page covers. No mode word: a streetcar timetable can run entirely as replacement buses
 * (503, 507), which the agency figures can't tell apart (Ryan, CIV-1075).
 */
export function coveredRoutesText(/** The agency's short name (useLiveAgencyName). */ agency: string, routes: ReadonlyArray<unknown>): string {
  return `${routes.length} ${agency} ${plural(routes.length, 'route')}`;
}

/** "Built Oct 16, 6:12 PM", in Toronto time (the agencies Live covers), from an ISO timestamp (shared/timeText.ts). */
export function builtText(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  return `Built ${p('month')} ${p('day')}, ${clockTime(Number(p('hour')) * 60 + Number(p('minute')))}`;
}

/** The heading at the foot of every Live page (MethodFootnote), and the name its draw error uses. */
export const METHOD_TITLE = 'How this is measured';

/** The four group labels of "How this is measured", the same on every Live page. */
export const METHOD_GROUPS = {
  numbers: 'What each number means',
  data: 'Where the data comes from',
  colours: 'How changes are coloured',
  limits: 'Limits',
} as const;

/** The recording-gaps limit, said once per page. */
export const RECORDING_GAPS = "are times our recording missed, such as when the feed went down. Trips during a gap aren’t counted, and days with gaps are left out.";

/** Run time against the timetable in whole minutes: "2 min faster than the schedule" (the tile's caption), or without the tail in a table cell. */
export const runTimeDiffText = (diffMin: number, tail = true): string => (diffMin === 0 ? 'same as the schedule' : `${Math.abs(diffMin)} min ${diffMin < 0 ? 'faster' : 'slower'}${tail ? ' than the schedule' : ''}`);

/** A run time against the schedule as a share: "7% faster", "3% slower", or "on time" when it rounds to 0% (the tile and the Routes table, CIV-945, CIV-1448). */
export function runTimeShareText(over: number): string {
  const p = Math.round(Math.abs(over) * 100);
  return p === 0 ? 'on time' : `${p}% ${over < 0 ? 'faster' : 'slower'}`;
}

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
    const [m, day] = dateRange(d, d).split(' ');
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
  return days.length ? `${leftOutList(days)} left out: gaps in our recordings ${plural(days.length, 'that day', 'those days')}` : null;
}

/**
 * Where this week and last week are compared, the days left out in one list, this week's first (Ryan, CIV-910):
 * "Excluding Oct 11", "Excluding Oct 11 and Oct 4", "Excluding Oct 11, Oct 12 and Oct 4". Null when every day of both
 * weeks counted.
 */
export function excludingWeeksText(thisWeek: readonly string[], lastWeek: readonly string[]): string | null {
  const days = [...[...new Set(thisWeek)].sort(), ...[...new Set(lastWeek)].sort()].map(d => dateRange(d, d));
  if (!days.length) return null;
  return `Excluding ${days.length === 1 ? days[0] : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`}`;
}
