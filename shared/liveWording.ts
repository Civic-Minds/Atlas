import { noDataText } from './noDataText';
import { agencyInSentence } from './agencyArticle';
import { dateRange } from './dateText';
import { clockTime } from './timeText';
import { countOf, plural } from './overflowText';
import { countText, percentText } from './numberText';
import { minutesText } from './liveFormat';
import { BUNCHED_GAP_SEC, GAPPED_FACTOR } from './rules/live';

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
/** The route strip's marked stretch where bunching starts, beside DELAY_STARTS_LABEL (CIV-1803). */
export const BUNCHING_FORMS_LABEL = 'Bunching forms';
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
/** A chart or strip mark resting on sparse location reports (Ryan, CIV-1795: the approved hover line's words; was "Less exact"). */
export const LESS_EXACT_LABEL = 'Fewer location reports';
/** The back link from a report page to the Live map app. */
export const OPEN_LIVE_LABEL = 'Open Live';
/** The link from a report page to the same route or agency on the Live map. */
export const VIEW_ON_LIVE_MAP = 'View on Live map';
/** The direction pills' choice for both directions together. */
export const BOTH_DIRECTIONS_LABEL = 'Both directions';
/** The direction pills, table column and vehicle card row. */
export const DIRECTION_LABEL = 'Direction';
/** The vehicle card's rows (CIV-2024, Ryan: "label the number 'Vehicle', add 'Next stop' ... and 'Updated N sec ago'"). */
export const VEHICLE_LABEL = 'Vehicle';
export const NEXT_STOP_LABEL = 'Next stop';
export const UPDATED_LABEL = 'Updated';
/** How long ago the feed placed the vehicle: "25 sec ago" under a minute, then whole minutes, "2 min ago" (CIV-2024). */
export const updatedAgoText = (ageSec: number): string => {
  const sec = Math.max(0, Math.round(ageSec));
  return sec < 60 ? `${sec} sec ago` : `${minutesText(Math.floor(sec / 60))} ago`;
};
/** The period picker's label. */
export const TIME_OF_DAY_LABEL = 'Time of day';
/** The heading over what else was measured in a stretch, and its glossary term (Ryan, CIV-1795 question 8, option a; was "Linked to"). */
export const LINKED_TO_TITLE = 'Also measured in this stretch';
/** A link verdict: its figure passes the set level, or not (Ryan, CIV-1795 question 8, option a; was "Linked" / "Not linked"). */
export const LINKED_LABEL = 'High';
export const NOT_LINKED_LABEL = 'Low';
/** A trip that ends before the line's end: a vehicle card tag and a trip pattern's kind. */
export const SHORT_TURN_LABEL = 'Short turn';
/** The two kinds of bunching gap, in charts, legends and figures. */
export const TOO_CLOSE_LABEL = 'Too close together';
export const TOO_FAR_LABEL = 'Too far apart';
/** The share of gaps too short or too long, as a figure and column (CIV-1795: Live's two bunching words; was "Gaps off the schedule"). */
export const GAPS_OFF_SCHEDULE_LABEL = 'Too close or too far apart';
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
/** The column and figure label for the typical minutes a stretch adds (CIV-1448; CIV-1795: "Usually", as the Live column; was "Typical added"). */
export const TYPICAL_ADDED = 'Usually adds';
/** Delays start: the minutes added on the way into a stop that aren't made back over the next 3 stops, on the Live map's stop and stretch cards (Ryan, CIV-1795 question 9: "Time lost: 2 min"). */
export const TIME_LOST_LABEL = 'Time lost';
export const timeLostLine = (min: number): string => `${TIME_LOST_LABEL}: ${minutesText(min)}`;
/** The name of the stretch where delay begins: the route strip's marked stretch and the Live map's measure button (Ryan, CIV-1602: "Delays start" everywhere). */
export const DELAY_STARTS_LABEL = 'Delays start';
/** The Live map's name: its page title and the title on a saved image of it (Ryan, CIV-1602; "Live", not "Live vehicles", 2026-11-17). */
export const LIVE_MAP_TITLE = 'Live';

/**
 * The line under "Stops most often late", the same on the agency page and the route's Full analysis (CIV-1448):
 * "The 10 stops where vehicles most often leave more than 5½ min late, Oct 8–14, across every route Live covers." on the
 * agency page; "… late (stops with 30+ departures)." on a route. With no dates, the days are left out.
 */
export const lateStopsIntro = (count: number, o: { scope: 'agency' | 'route'; dates?: readonly string[] }): string => {
  const d = o.dates ?? [];
  const days = d.length ? `, ${dateRange(d[0], d[d.length - 1])}` : '';
  return `The ${countOf(count, 'stop')} where vehicles most often leave ${LATE_THRESHOLD}${days}${o.scope === 'agency' ? ', across every route Live covers' : ` ${RANKED_STOPS_NOTE}`}.`;
};

/** Which stops a route's late-stops list ranks, after the sentence it ends. */
const RANKED_STOPS_NOTE = '(stops with 30+ departures)';
/** The route's late-stops intro when no map is shown. */
export const STOPS_RANKED_LATE_TEXT = `Stops ranked by how often vehicles leave ${LATE_THRESHOLD} ${RANKED_STOPS_NOTE}.`;

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

/** A Live route page with no measured day, in its subtitle where "data up to Oct 14" would be (Ryan, CIV-1795 question 4, option a). */
export const NO_DATA_YET = noDataText();
/** The method line on trips close to the late or ahead cutoff (Ryan, CIV-1795 question 12, option a; was "Near a limit"). */
export const NEAR_CUTOFF_TERM = 'Close to the cutoff';
/** The agency page's method term for its combined figures, and its glossary term (Ryan, CIV-1795 question 13, option a; was "Network figures"). */
export const AGENCY_FIGURES_TERM = 'Agency figures';

/** The recording-gaps limit, said once per page. */
export const RECORDING_GAPS = "are times our recording missed, such as when the agency’s vehicle locations stopped coming in. Trips during a gap aren’t counted, and days with gaps are left out.";

/** Run time against the timetable in whole minutes: "2 min faster than the schedule" (the tile's caption), or without the tail in a table cell. */
export const runTimeDiffText = (diffMin: number, tail = true): string => (diffMin === 0 ? 'same as the schedule' : `${Math.abs(diffMin)} min ${diffMin < 0 ? 'faster' : 'slower'}${tail ? ' than the schedule' : ''}`);

/** A run time against the schedule as a share: "7% faster", "3% slower", or "on time" when it rounds to 0% (the tile and the Routes table, CIV-945, CIV-1448). */
export function runTimeShareText(over: number): string {
  const p = Math.round(Math.abs(over) * 100);
  return p === 0 ? 'on time' : `${p}% ${over < 0 ? 'faster' : 'slower'}`;
}

/** A rise in a share, in percentage points: "+31 pt" (the unit the tiles use for a change in a share). */
export const risePointsText = (rise: number): string => `${rise > 0 ? '+' : ''}${Math.round(rise * 100)} pt`;

/** A share before and after a stretch: "10% to 41%" (Ryan, CIV-1795 7b; CIV-1805). Without both shares (older summaries), the rise in points. */
export const shareRiseText = (r: { value: number; fromShare?: number; toShare?: number }): string =>
  r.fromShare != null && r.toShare != null ? `${percentText(r.fromShare)} to ${percentText(r.toShare)}` : risePointsText(r.value);

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

/** Under a table whose Bunching row shows two figures: what each is, from the rules' own thresholds (Ryan's wording, 2026-11-18; CIV-1878). */
export const bunchingSplitNote = (): string =>
  `Bunching: the first figure is gaps under ${minutesText(BUNCHED_GAP_SEC / 60)} between vehicles, the second gaps more than ${GAPPED_FACTOR === 2 ? 'twice' : `${GAPPED_FACTOR} times`} the scheduled gap.`;

/** The same note short, beside the Learn more link that opens Studio's About panel at the Live part (Ryan, 2026-11-19). The map key says the same in its own words. */
export const bunchingShortNote = (): string =>
  `Bunching: gaps under ${minutesText(BUNCHED_GAP_SEC / 60)} or over ${GAPPED_FACTOR}× scheduled.`;

/** The window event the Learn more link fires; the app opens the About panel at its Live part. */
export const OPEN_ABOUT_LIVE_EVENT = 'atlas:open-about-live';

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

/**
 * CIV-1828, Studio's Live page: wording pending Ryan's OK, all in one place until he approves or changes it (Studio is
 * local only). The card lines are the glossary's ("## Live" card wording, docs/GLOSSARY.md), shown on screen for the
 * first time; the pill's name is new. The list has no heading (Ryan, 2026-11-17: the menu already says "Live" and the map
 * shows the rest).
 */
export const STUDIO_LIVE_PENDING = {
  /** The measure pill. */
  fallsBehindPill: 'Falls behind',
  /** A stop pair's lines: its time lost (timeLostLine, the Delays start cards' own), then the sample. */
  sample: (trips: number, days: number): string => `${countText(trips)} trips, ${countText(days)} days`,
  /** The collapsed list of stop pairs whose schedule allows more than vehicles need. */
  looserTitle: 'Where the schedule is looser than needed',
  looserLine: (min: number): string => `The schedule allows ${minutesText(min)} more than vehicles need`,
} as const;

/**
 * CIV-1878, Studio Live's at-a-glance lines (Ryan chose the mockup's words, 2026-11-19: "1"): how much data there is and
 * how departures split this week between on time and more than 5½ min late.
 */
export const STUDIO_GLANCE = {
  /** After the bold count: "9 routes recorded", alone (Ryan, 2026-11-20, CIV-1966: "The 3 days of data and the Nov 16-18 seems almost not needed"). */
  routes: 'routes recorded',
  barTitle: 'Departures this week',
  onTime: 'On time',
  late: LATE_THRESHOLD.charAt(0).toUpperCase() + LATE_THRESHOLD.slice(1),
} as const;

/**
 * CIV-1886 / CIV-1893: Studio Live's Settings chip, the planner's own late, early, bunched and gapped settings. Ryan approved
 * these rows word for word ("Sure for now", 2026-11-19). The standard value is shown in bold, with no "(standard)" tag. A
 * row's choices are numbers in a row, with its unit once after them.
 */
export const STUDIO_SETTINGS_TEXT = {
  chip: 'Settings',
  rows: {
    lateAfterMin: 'Counts as late after',
    earlyBeforeMin: 'Counts as early from',
    bunchedWithinMin: 'Counts as bunched under',
    gappedFactor: 'Counts as a long gap over',
  },
  units: {
    lateAfterMin: 'min',
    earlyBeforeMin: 'min ahead',
    bunchedWithinMin: 'min apart',
    gappedFactor: '× the scheduled wait',
  },
} as const;

/**
 * CIV-1893, Studio's "right now" view of a route: wording pending Ryan's OK. The figures and the definitions under them
 * come from shared/liveNow.ts, the same as the MCP's route_now.
 */
export const STUDIO_NOW_PENDING = {
  title: 'Right now',
  /** The reading's time and how old it is: "Reading from 8:26 PM, 0.7 min ago". */
  reading: (clock: string, ageMin: number): string => `Reading from ${clock}, ${minutesText(ageMin)} ago`,
} as const;

/**
 * CIV-1828, the route panel redesign's two options (2026-11-20): wording pending Ryan's pick. "Right now" as one table row
 * per direction, so a direction, a stretch and a stop each read as what they are (Ryan: "Is this destinations or parts of
 * the route or what?"). Option A also names the worst stretches under the table, each as "between X and Y".
 */
export const STUDIO_ROUTE_NOW_PENDING = {
  columns: { direction: 'Direction', vehicles: 'Vehicles', bunched: 'Bunched', gapped: 'Long gaps' },
  /** "Bunched between Beverley St and Shaw St: 0.9 min apart". `place` is betweenLabel's. */
  bunchedAt: (place: string, min: number): string => `Bunched ${place}: ${minutesText(min)} apart`,
  /** "Long gap between Mountstephen St and Wolfrey Ave: 24 min wait, scheduled every 7 min". */
  gappedAt: (place: string, waitMin: number, scheduledMin: number | null): string =>
    `Long gap ${place}: ${minutesText(waitMin)} wait${scheduledMin != null ? `, scheduled every ${minutesText(scheduledMin)}` : ''}`,
} as const;

/** "Last 17 service days, Sep 30 – Oct 16": the days a route's figures cover (the method note's own words, CIV-910). */
export const serviceDaysText = (days: number, first: string, last: string): string => `Last ${days} service days, ${dateRange(first, last)}`;
