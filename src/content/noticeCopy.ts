/**
 * Every notice, empty-state, error and callout text the site shows, in one place (CIV-1045, Ryan: "one single page where
 * the entire site pulls from"). Components only call these; a guard test (noticeCopy.test.ts) fails on new inline text.
 * Live's texts stay with Live for now (Atlas Live's lane).
 *
 * Codes (CIV-1045): each notice has a permanent N-code and each Learn-more explainer an E-code, the same as on the
 * review page (_review/notices). A new text takes the next free number; numbers are never reused. Every notice with
 * Learn more names its explainer in NOTICE_EXPLAINERS, so the two can be checked against each other.
 */
import { PAGE_NAMES } from '../../shared/pageNames';
import { BACK_PLACES, backLinkLabel } from './backLinks';
import { FREQUENT_SERVICE_TITLE } from '../../shared/frequentService';
import { shortDate } from '../../shared/dateText';
import { metresText } from '../../shared/unitText';
import { NEARBY_ROUTES_RADIUS_M } from '../../shared/rules/limits';
import { joinList, plural, countOf } from '../../shared/overflowText';
import { countText, countWord } from '../../shared/numberText';
import { LIVE_VEHICLES_TITLE, METHOD_TITLE } from '../../shared/liveWording';
import { agencyNames } from '../utils/agencyName';
import { agencyPossessive, agencyPossessiveSentenceStart, agencySentenceStart } from '../../shared/agencyArticle';
import { delayAmount, headwayAbout, headwayOrBetter } from '../utils/headwayText';
import { onDemandStopZoneNames, resolveOnDemandZone, type OnDemandPickupStop, type OnDemandServiceDetails } from '../../shared/onDemandAvailability';
import { dayInSentence, dayPlural, isDayType } from '../../shared/dayTypes';
import { LIVE_PATH } from '../../shared/pagePaths';
import { OVERNIGHT_STORY } from '../../shared/researchStories';

// N2 timetable-ended, N3 manual-timetable-ended
/** Shared user-facing copy for every expired-feed notice. */
export function expiredFeedNotice(agencyName: string, expDateStr?: string, manualFeedSource = false): string {
  const { primary } = agencyNames(agencyName).card;
  const ended = `${agencyPossessiveSentenceStart(primary)} schedule ended${expDateStr ? ` on ${expDateStr}` : ''}.`;
  // N3 (Ryan): the kept-by-hand detail is in its explainer (E1's MANUAL_FEED piece, N76), not the notice.
  void manualFeedSource;
  return `${ended} Times shown may be out of date.`;
}

/**
 * A time range kept on one line in running text (#1133): no break at its dash ("7–" / "11 PM") or before
 * its AM/PM. Word joiners hold the dash to its numbers and a no-break space holds the AM/PM; both are
 * invisible, so the words read and copy the same.
 */
export function keepRangeTogether(range: string): string {
  return range
    .replace(/\s*–\s*/g, '\u2060–\u2060')
    .replace(/ (AM|PM|a\.m\.|p\.m\.)/gi, '\u00a0$1');
}

// N13 part-period-filter. CIV-1251 (Ryan, 2026-11-01): one sentence shape with N9, "This route runs every 45 min, only from
// 9 AM–1 PM.", and the rest of the period as a second sentence ("It has no trips from 6–7 AM.", "It runs less often after
// 9 AM."). A part the data can't tell about adds nothing: the sentence just stops.
export function selectedRouteFilterNotice(options: {
  /** The route's own filter value for the period; without one the notice names no frequency. */
  headway?: number | null;
  activeRange: string;
  periodRange: string;
  /** The period's parts outside the run of service, with their times formatted: no trips there, fewer, or unknown. */
  outside?: Array<{ service: 'none' | 'less' | 'unknown'; /** A part at the start: "6–7 AM". */ range?: string; /** A part at the end: "9 AM". */ after?: string }>;
}): string {
  const only = `only from ${keepRangeTogether(options.activeRange)}`;
  const lead = options.headway != null ? `This route runs ${headwayAbout(options.headway)}, ${only}.` : `This route runs ${only}.`;
  const where = (part: NonNullable<typeof options.outside>[number]) => (part.after != null ? `after ${keepRangeTogether(part.after)}` : `from ${keepRangeTogether(part.range ?? '')}`);
  const of = (service: 'none' | 'less') => (options.outside ?? []).filter(part => part.service === service).map(where).join(' or ');
  const rest = [of('none') && `It has no trips ${of('none')}.`, of('less') && `It runs less often ${of('less')}.`].filter(Boolean);
  return [lead, ...rest].join(' ');
}

// N8 no-trips-in-period, N11 not-in-period, N17 and N26 (CIV-1077: one sentence; CIV-1251 "no trips", as the stop card says): "This route has no trips from 6–9 AM."
const noTripsText = (subject: 'route' | 'agency', when: string) => `This ${subject} has no trips ${when}.`;
const routeNoTripsText = (when: string) => noTripsText('route', when);

// N8 no-trips-in-period, N9 limited-in-period. CIV-1251: N13's shape, "This route runs only from 7–9 AM." The card already
// shows whether there is a number, so no sentence says so.
export function periodServiceNotice(periodRange: string, partial: boolean, activeRange?: string): string {
  return partial
    ? selectedRouteFilterNotice({ activeRange: activeRange || periodRange, periodRange })
    : routeNoTripsText(`from ${keepRangeTogether(periodRange)}`);
}

/** CIV-1251: the stop card's N9, "Runs only from 7–9 AM", for a route the route card says runs only part of the period. */
export function stopRunsOnlyText(activeRange: string): string {
  return `Runs only from ${keepRangeTogether(activeRange)}`;
}

// N10 uneven-gaps (Ryan's wording, CIV-1202)
export function unevenServiceNotice(longestGap: number): string {
  return `Gaps between trips can be up to ${delayAmount(longestGap)}.`;
}

// N7 no-route-line
export const NO_ROUTE_SHAPE_NOTICE = "This route’s line can’t be shown on the map because it’s missing from the agency’s data.";

// N16 booked-ahead
/** CIV-1006: a route riders must book ahead (Ryan's wording). */
export const BOOKING_REQUIRED_NOTICE = 'Rides on this route must be booked ahead.';


// N11 not-in-period, N12 misses-filter
/** Notices name the chosen time of day, never "the selected period" (Ryan); `periodRange` is "6–9 AM", or null for no chosen time ("across the day"). */
export function selectedRouteOutsideFilterNotice(maxHeadway: number, periodRange: string | null): string {
  const when = periodRange ? keepRangeTogether(periodRange) : null;
  return maxHeadway === Infinity
    ? routeNoTripsText(when ? `from ${when}` : 'across the day')
    // CIV-1251: a threshold in a sentence reads "every 15 min or better" (docs/style/TEXT.md).
    : `This route doesn’t run ${headwayOrBetter(maxHeadway)} ${when ? `for all of ${when}` : 'across the day'}.`;
}

// N123 part-of-route-meets-filter (CIV-514; CIV-1251, Ryan 2026-11-01): the selected route misses the filter, but its shared
// stretch qualifies, as the shared-stretch overlay draws (failingRouteSharedRanges). Names the times, and the direction when
// only one is like this: "Northbound, only the shared stretch runs every 15 min or better from 3–7 PM."
export function selectedRoutePartMeetsFilterNotice(maxHeadway: number, periodRange: string | null, direction?: string): string {
  const when = periodRange ? `from ${keepRangeTogether(periodRange)}` : 'across the day';
  return `${direction ? `${direction}, only` : 'Only'} the shared stretch runs ${headwayOrBetter(maxHeadway)} ${when}.`;
}

// E1 outdated-schedule, paragraph 1 end (N2 and N3 versions); the rest of E1 is pieces (EXPLAINER_PIECES).
export const EXPIRED_FEED_EXPLANATION =
  'This is the latest schedule the agency has published that we could verify.';

// N77 check-history / E1 line 2. No last-checked or last-refreshed date (Ryan, CIV-1242), so N78 is gone.
export function expiredFeedCheckHistory(options: { count?: number; since?: string }): string {
  if (options.count != null && options.since && shortDate(options.since)) {
    return `We’ve checked for a new schedule ${options.count} ${plural(options.count, 'time')} since ${shortDate(options.since)}.`;
  }
  return '';
}

// ---- Loading, errors and empty lists ----
// N65 loading, N67 loading-selection
/** Wording for loading and error states in panels and badges, so every screen says it the same way. */
/** "Loading night service…": the noun after the verb, then an ellipsis character (not three dots). */
export const loadingText = (noun: string) => `Loading ${noun}…`;

// N51 night-failed, N54 history-failed, N66 agencies-failed, N67 selection-failed
/** "This route couldn't load.": the thing first. */
export const loadErrorText = (subject: string) => `${subject.charAt(0).toUpperCase()}${subject.slice(1)} couldn’t load.`;

/** The zoomed-out note, shared by the map export and the Night list (CIV-1337, Ryan: reuse this exact string). */
export const ZOOMED_OUT_NOTICE = 'Zoomed out. Some less frequent routes are hidden.';
// N54 history-failed (hint)
/** Added after a load error that the person can retry. */
export const RETRY_HINT = 'Check your connection and try again.';

// N28 routes-loading
/** A route list with nothing to show: the agency card's wording, shared with History's agency view. */
export const NO_ROUTES_LOADED = 'No routes loaded yet.';
// N29 no-routes-match
/** A route list whose mode pill (or search) leaves nothing: "No streetcar routes match.", or "No routes match." with no pill. */
export const noRoutesMatchText = (modeLabel?: string | null) => `No ${modeLabel ? `${modeLabel.toLowerCase()} ` : ''}routes match.`;
// N38 no-search-matches
export const NO_SEARCH_MATCHES = 'No matches found.';
// N40 no-agencies-match
export const NO_AGENCIES_MATCH = 'No agencies match.';
// N41 in-view-no-agencies: the same words as N40, from one place.
export const NO_MATCHING_AGENCIES = NO_AGENCIES_MATCH;
// N42 in-view-no-routes: N29 with no mode pill.
export const NO_MATCHING_ROUTES = noRoutesMatchText();
// N37 no-routes-nearby
export const NO_ROUTES_NEARBY = `No routes within ${metresText(NEARBY_ROUTES_RADIUS_M)}.`;
// N44 no-suggestions
export const NO_ROUTE_SUGGESTIONS = 'No route suggestions in this area.';
// N43 no-agencies-in-view
export const NO_AGENCIES_IN_VIEW = 'No agencies in view.';
// N115, N116 settings-list-no-search-matches (CIV-957): "No hidden routes match your search."
export const noSearchMatchText = (things: string) => `No ${things} match your search.`;
// N52 night-no-agencies (CIV-1077: "your search", as N115)
export const NO_AGENCIES_MATCH_SEARCH = noSearchMatchText('agencies');
// N113 settings-no-limited-routes
export const NO_LIMITED_ROUTES_IN_VIEW = 'No part-time routes in view.';
// CIV-1251: the list "See all part-time routes" opens, as the setting names them.
export const PART_TIME_ROUTES_TITLE = 'Part-time routes';
export const PART_TIME_ROUTES_SEARCH = searchPlaceholder('part-time routes');
export const PART_TIME_ROUTES_NOUN = 'part-time routes';
// N114 settings-hidden-routes-unavailable
export const HIDDEN_ROUTES_UNAVAILABLE = 'The hidden-route list is unavailable right now.';
// N117 settings-no-degraded-feeds
export const NO_DEGRADED_FEEDS = 'No degraded or unusable feeds are currently recorded.';
// N119 story-map-loading: loadingText with the agency's network, "Loading MiWay’s network…".
export const storyMapLoadingText = (agencyName: string) => loadingText(`${agencyPossessive(agencyName)} network`);
// N120 story-map-failed
export const storyMapFailedText = (agencyName: string) => `The ${agencyName} network preview is unavailable.`;
// N118 settings-no-feed-matches
export const NO_FEED_MATCHES = 'No feeds match your search or filter.';

// ---- Route labels and setting definitions (CIV-957 item 2): each written once, used by every card, list and setting ----
// D1 route-limited: a list value with no steady frequency ("limited" in place of a number).
export const LIMITED_SERVICE_LABEL = 'limited';
/**
 * CIV-1251: the one word a card row with no number reads, whichever check found it. The Night card: "Runs irregularly
 * overnight"; a time period: D2. The card has no All day row (CIV-1279: the map has no All day, so no rider reaches one).
 */
export function noNumberRowLabel(options: { nightView?: boolean }): string {
  return options.nightView ? IRREGULAR_OVERNIGHT_LABEL : IRREGULAR_PERIOD_LABEL;
}
// D2 irregular-period (Ryan's words, CIV-1238): the route runs in the period, but the filter finds no regular cadence. On cards.
export const IRREGULAR_PERIOD_LABEL = 'Runs irregularly in this period';
/** CIV-1251: a Night card row with no grade. The Night view isn't a period in the picker, so not "in this period". */
export const IRREGULAR_OVERNIGHT_LABEL = 'Runs irregularly overnight';
// D3 irregular-period-short: the same, in tight spots (table cells, list values).
export const IRREGULAR_PERIOD_SHORT_LABEL = 'Irregular';
// D4 setting-hide-occasional (Ryan, CIV-1238: "Occasional", not "one-off")
export const HIDE_ONE_OFF_SETTING = { label: 'Hide occasional routes', description: 'School runs, a few trips a day, on-demand.' } as const;
// D5 setting-hide-part-time
export const HIDE_PART_TIME_SETTING = { label: 'Hide part-time routes', description: 'Only at rush hour, evenings or some days.' } as const;
// D6 setting-hide-degraded-feeds
export const HIDE_DEGRADED_FEEDS_SETTING = { label: 'Hide degraded feeds', description: 'Hides agencies with known data-quality problems. Feeds still being reviewed remain visible.' } as const;

// ---- Shared labels and card sentences (CIV-1160): moved here with the same words; no review-page codes yet ----
// The back link from an agency or stop card to the map (CIV-1462: the words live in backLinks.ts).
export const BACK_TO_MAP_LABEL = BACK_PLACES.map;
// The region pill and group for an agency with no region.
export const OTHER_REGION_LABEL = 'Other';
// The row for the shared main stretch above a direction's branch rows (route card, stop card).
export const SHARED_STRETCH_LABEL = 'Shared stretch';
// The frequency heading and button (full-day chart, filter chip, Frequency picker).
export const FREQUENCY_LABEL = 'Frequency';
// The button at the end of the For Transit Planners and For Researchers pages that emails us (CIV-1706); also the email's subject.
export const REQUEST_DEMO_LABEL = 'Request a demo';

// ---- For Transit Planners and For Researchers pages (CIV-1793): Ryan's words, 2026-11-16, word for word ----
/** One feature card's words: a title of about five words (title case) and two sentences that never name Atlas. */
export type FeatureCardCopy = { title: string; text: string; /** Shows the Beta tag beside the title. */ beta?: boolean };
/** The About page's headline (CIV-1206 D), a sentence, so it stays sentence case. */
export const ABOUT_HEADLINE = 'Find the transit service that actually runs.';
/** What Atlas is, in one line: the About page's hero. Its home is shared/pageNames, so the search descriptions use it too. */
export { ATLAS_MAP_SUMMARY } from '../../shared/pageNames';
/** The About page's closing section heading, above ATLAS_INTRO_TEXT (CIV-1733). */
export const ABOUT_CLOSER_HEADING = 'Built for looking closer.';
/** The "Where the Data Comes From" section on the For Transit Planners and For Researchers pages (CIV-1724). */
export const DATA_SOURCE_TITLE = 'Where the Data Comes From';
export const dataSourceText = (agencies: string, countries: string) =>
  `Atlas covers ${agencies} transit agencies in ${countries}. It reads each agency’s published GTFS feed and checks for updates every week, so a service change shows up soon after the agency publishes it. If an agency’s schedule has run out, Atlas says so on the map.`;
/** For Transit Planners: the hero's line (CIV-1788), the seven cards in a planner's workflow order (CIV-1710) and the demo card. */
export const PLANNERS_COPY = {
  intro: 'See how often every route runs, at every hour, across every agency in the region. It’s built for agency planners, consultants and city and regional staff.',
  cards: {
    frequency: { title: 'See Frequency, Not Just Routes', text: 'Every route is coloured by its headway: every 10, 15, 20, 30 or 60 min, or less often. Pick a frequency and only the routes that meet it stay on the map — so you can check your network against your own standard.' },
    // Ryan: "Probably need to be edited later ngl"; the text is unchanged for now.
    dayTime: { title: 'Service by Day, Time and Span', text: 'Switch between weekday, Saturday and Sunday, then pick a time of day from AM peak to overnight, so peak, off-peak and owl service each get their own map. Compare puts two of them side by side on desktop, and any route opens an hourly chart of its headways and span of service.' },
    agencies: { title: 'Every Agency on One Map', text: 'Transit doesn’t stop at an agency’s border, and neither does the map. See every agency’s routes together, or filter to just one.' },
    beforeAfter: { title: 'Before and After a Schedule Change', text: 'Compare two versions of a schedule route by route: frequency, trips, span and trip time. Routes are grouped by how much they changed.', beta: true },
    vehiclesNeeded: { title: 'Vehicles Needed at Every Frequency', text: 'Pick a route and a time of day to see how many vehicles it runs now, and how many it would need for more frequent service. Routes that share vehicles are counted together.', beta: true },
    delays: { title: 'Where Delays Build Up', text: 'Every TTC streetcar’s position is recorded each minute and checked against the schedule. Each route’s page shows where delays start, which stops run late most often and how this week compares with last.', beta: true },
    share: { title: 'Share What You Find', text: 'Send a link that opens the same place and settings, with the latest schedules. Or export a map image with a dated source line, ready for a slide deck or a report.' },
  } satisfies Record<string, FeatureCardCopy>,
  demo: 'We’ll explore your network with you and show how the map can back up your next service review.',
};
/** For Researchers: the three cards (History is beta only) and the demo card. Its hero line is ATLAS_INTRO_TEXT. */
export const RESEARCHERS_COPY = {
  cards: {
    history: { title: 'How Service Changed, Year by Year', text: 'Past schedules are kept as dated snapshots, so a study of service growth or cuts can start from what was actually scheduled. Pick a year to map an agency’s routes as they ran then, and open any route to see its frequency over the years.', beta: true },
    compareCities: { title: 'Compare Cities on One Map', text: 'Put two maps side by side, each with its own city, day, time of day and frequency. Set one network’s weekday against its Sunday, or one city’s rush hour against another’s.' },
    cite: { title: 'Maps You Can Cite', text: 'Every exported map has a source and a date on it, so it’s ready to cite. A link opens the same view with the latest schedules.' },
  } satisfies Record<string, FeatureCardCopy>,
  demo: 'We’ll explore your research question with you and show how the map can back up your next study.',
};
/**
 * Every search box's hint, in one place (CIV-1569): "Find " + what the box finds + "…" ("Find routes…", "Find an
 * agency…", "Find a MARTA route…"). Search box hints start with "Find" (Ryan, 2026-11-14); the "…" is from CIV-1160
 * question 8. With nothing named it reads "Find…". `things` is in lower case unless it holds a name ("a MARTA route"). The top bar's one-word phone hint
 * is SEARCH_SHORT_PLACEHOLDER.
 */
export function searchPlaceholder(things?: string): string {
  return things ? `Find ${things}…` : 'Find…';
}
/** The top bar's hint on a phone, where the box has room for one word. */
export const SEARCH_SHORT_PLACEHOLDER = 'Find';
/** The map's search box hint. */
export const SEARCH_ROUTES_PLACEHOLDER = searchPlaceholder('routes');
/** The Bustang connections list with no trips on the chosen day (CIV-101). */
export const NO_BUSTANG_TRIPS = 'No Bustang trips this day.';
/** The Bustang connections view's search box (CIV-101): it finds routes. */
export const SEARCH_BUSTANG_PLACEHOLDER = searchPlaceholder('routes');
/** The Night service view's search box. */
export const SEARCH_NIGHT_PLACEHOLDER = searchPlaceholder('agencies or routes');
/** Live's search box. */
export const SEARCH_VEHICLES_PLACEHOLDER = searchPlaceholder('vehicles');
/** About's agency list. */
export const SEARCH_AGENCIES_PLACEHOLDER = searchPlaceholder('agencies');
/** Settings: the hidden-routes list. */
export const SEARCH_HIDDEN_ROUTES_PLACEHOLDER = searchPlaceholder('hidden routes');
/** Settings: the hidden feeds list. */
export const SEARCH_FEEDS_PLACEHOLDER = searchPlaceholder('feeds');
/** The agency filter chip's list, where the box is narrow. */
export const SEARCH_ANY_PLACEHOLDER = searchPlaceholder();
/** The nearby-routes panel's title and the back link to it, in sentence case (Ryan, CIV-1160 question 7, 2026-11-13). */
export const NEAR_YOU_TITLE = 'Near you';
/** The report action's name on the map menu, the cards and the info panel (Ryan, CIV-1160 question 6, 2026-11-13). */
export const REPORT_A_PROBLEM = 'Report a problem';
/** The day, time and mode pickers' names, the same on every filter surface (Ryan, CIV-1160 question 6, 2026-11-13). */
export const DAY_LABEL = 'Day';
export const TIME_LABEL = 'Time';
export const MODE_LABEL = 'Mode';
/** The full-day frequency chart's axis unit (CIV-1311, Ryan's wording 2026-11-03). */
export const TRIPS_PER_HOUR_LABEL = 'Trips per hour';
// The default title of an exported map image.
export const DEFAULT_EXPORT_TITLE = 'Transit map';
// The privacy settings title and the About panel link that opens it.
export const PRIVACY_SETTINGS_TITLE = 'Privacy & analytics';
// The button that tries a failed load again.
export const RETRY_LABEL = 'Retry';
/**
 * Every close (X) button's screen-reader name, in one place (CIV-1569), mirroring backLinkLabel: "Close " + the thing
 * it closes ("Close filters", "Close chart", "Close About Atlas"). A common thing is lower case; a name keeps its case.
 */
export const CLOSE_PLACES = {
  filters: 'filters',
  settings: 'settings',
  schedule: 'schedule',
  chart: 'chart',
  reportForm: 'report form',
  exportDialog: 'export dialog',
  whatsNew: 'what’s new',
  privacySettings: 'privacy and analytics settings',
  aboutAtlas: BACK_PLACES.aboutAtlas,
} as const;
export function closeLabel(place: string): string {
  return `Close ${place}`;
}
/** The clear (X) button inside a search box, to screen readers. */
export const CLEAR_SEARCH_LABEL = 'Clear search';
// Route card: a direction with no rows in the chosen period, by its times as the stop card says it (CIV-1251): "No trips from 9 AM–3 PM".
export const noServiceInPeriodText = (periodRange: string) => stopRouteNoTripsNotice(periodRange);
// Filter panel: the route settings shown outside the Frequency view.
export const SETTINGS_APPLY_TO_FREQUENCY_MAP = 'These settings apply to the Frequency map.';
// Filter panel: the Compare map B note beside the B badge.
export const COMPARE_B_PICKER_NOTE = 'The frequency, day and time above are map A; pick map B here. Modes and agencies apply to both maps. Leave Compare from the More menu.';

// ---- Map keys (CIV-957) ----
// K1 frequency-key heading
export const MAP_KEY_FREQUENCY = 'Frequency';
// K2 frequency-key selected
export const MAP_KEY_SELECTED = 'Selected or in your filters';
// K3 frequency-key other
export const MAP_KEY_OTHER = 'Other routes';
// K4 night-key (also the exported image's key)
export const MAP_KEY_NIGHT = OVERNIGHT_STORY.cardTitle;
/** A Night service row whose overnight trips cover only part of the route (the list and the route card, CIV-1599). */
export const OVERNIGHT_PART_OF_ROUTE = 'Overnight service on part of the route';
/**
 * #1510, CIV-1609 (Ryan: "1"): a list row's or agency-page cell's start or end time read on only part of the route (a short
 * tail), as in "every 30 min until 1:51 PM on part of the route". The same words as OVERNIGHT_PART_OF_ROUTE.
 */
export const ON_PART_OF_ROUTE = 'on part of the route';
/** The title an exported map image carries, by view (sentence case, docs/style/VISUAL.md; CIV-1599). The export reads
 * the frequency view from MAP_EXPORT_TITLES.frequency, so the words and the check can't drift apart. */
export const MAP_EXPORT_TITLES = {
  frequency: 'Transit frequency',
  frequentService: FREQUENT_SERVICE_TITLE,
  night: MAP_KEY_NIGHT,
  bustang: 'Bustang connections',
  history: 'Service history',
  live: LIVE_VEHICLES_TITLE,
} as const;
/** Shared labels used in more than one place (CIV-1599). */
export const ABOUT_ATLAS = BACK_PLACES.aboutAtlas;
export const VIEW_ON_MAP = 'View on map';
export const SEE_ALL_AGENCIES = 'See all agencies';
/** The link to the Docs page (About page, and the home page's static text, #1522). */
export const READ_HOW_ATLAS_WORKS = 'Read how Atlas works';
/** CIV-1733 (Ryan's exact text, 2026-11-16): what Atlas is, on About's "Built for looking closer." and the For Researchers intro. */
export const ATLAS_INTRO_TEXT = 'Atlas gathers published agency schedules in one place. Planners, researchers and advocates can compare routes across cities, time periods and modes, and see the patterns in scheduled service.';
/** CIV-1605 (Ryan): the agency table's hours-bar column, and the start of each bar's screen-reader name. */
export const WEEKDAY_HOURS_LABEL = 'Weekday hours';
export const WHATS_NEW_TITLE = PAGE_NAMES.whatsNew;
export const ON_DEMAND_SERVICE_LABEL = 'On-demand service';
export const ATLAS_BYLINE = 'Atlas by Civic Minds';
/** The Docs page's one name, on its links, heading and tab (Ryan, page-names refactor; CIV-1697 set it back to "Docs"). */
export const DOCS_PAGE_TITLE = PAGE_NAMES.docs;
export const EXPORT_MAP_TITLE = 'Export map image';
/** The locate button's name; Interval.tsx also finds the button by it, so both read this constant. */
export const LOCATE_ME_LABEL = 'Go to my location';

// ---- Neighbourhood shading (beta, CIV-482/CIV-524) ----
// Every text of the population density / median household income layer, approved word for word by Ryan
// (_review/civ-524). Class labels ("Under 50", "$50,000–$65,000") are built from the breaks in src/utils/contextLayer.ts.
// The settings row and its options.
export const CONTEXT_CONTROL_TITLE = 'Neighbourhood shading';
export const CONTEXT_OPTION_OFF = 'None';
export const CONTEXT_OPTION_DENSITY = 'Population density';
export const CONTEXT_OPTION_INCOME = 'Median household income';
// Legend titles, per metric (the unit is in the density title and in the income labels' $).
export const CONTEXT_LEGEND_TITLE_DENSITY = 'People per square kilometre';
export const CONTEXT_LEGEND_TITLE_INCOME = 'Typical household income';
// The grey hatched swatch.
export const CONTEXT_NO_DATA_LABEL = 'No reliable figure';
// The short credit after "OpenStreetMap · CARTO" while the shading is on, and its hover text with the survey years.
export const CONTEXT_CREDIT_SHORT = 'U.S. Census Bureau';
export const contextCreditTitle = (years: readonly [number, number]) =>
  `Source: U.S. Census Bureau, American Community Survey 5-year estimates (${years[0]}–${years[1]}) and TIGER/Line boundaries`;
// The tap card's lines: "1,240 people per square kilometre", "$62,000 a year", "Could be off by about 18%".
export const contextDensityLine = (value: string) => `${value} people per square kilometre`;
export const contextIncomeLine = (value: string) => `${value} a year`;
export const contextMarginLine = (pct: string) => `Could be off by about ${pct}`;
// An area at the survey's top code (the highest figure it reports).
export const CONTEXT_INCOME_TOP = '$250,000 or more';
export const CONTEXT_NO_DENSITY = 'No population figure for this area.';
export const CONTEXT_NO_INCOME = 'No income figure for this area.';
export const contextUncertainLine = (pct: string) => `Too uncertain to show. It could be off by about ${pct}.`;

// ---- Route card ----
// N1 weekday-variation
export const WEEKDAY_VARIATION_NOTICE = "This route’s weekday schedules vary by day.";
// N15 variants
/** "Includes variants 51A, 51B" (beta route variants). */
export const variantsIncludedNotice = (shortNames: string) => `Includes variants ${shortNames}`;
// N14 first-last-allowance
/** The info icon's hover text on a row whose frequency allows a longer first or last trip. */
export const FIRST_LAST_TRIP_ALLOWANCE_HINT = "This route’s frequency allows a slightly longer wait for the first or last trip of the day.";

// ---- Route and agency cards ----
// N6 route-shape-problem
/** A route whose line had a confirmed shape problem in the source feed (shared/routeDataQuality.ts has the code). */
export const ROUTE_DATA_QUALITY_WARNING_MESSAGE =
  "This route’s line on the map may be incomplete because of an error in the agency’s data.";
/** N108, N20 and E4's lead (CIV-1077: one sentence): "This agency is only available on Atlas beta." */
const onlyOnBetaText = (subject: string) => `${subject} is only available on Atlas beta.`;
// N108 beta-agency (replaces N19's wording; Ryan)
export const BETA_ROLLOUT_NOTICE = onlyOnBetaText('This agency');
// N20 beta-on-demand
/** The same for an on-demand service on the beta site; Ryan's approval named the agency notice only, so this one is unchanged. */
export const BETA_SERVICE_ROLLOUT_NOTICE = onlyOnBetaText('On-demand service');
/** N20 and N108's link (Ryan): the same page on the beta site; never preview, and not shown on beta itself. */
export const VIEW_ON_BETA = 'View';
/** The agency's rollout notice: its own (an on-demand service's), else the beta-only agency one. */
export function getRolloutNotice(agency: { betaOnly?: boolean; rolloutNotice?: string }): string | undefined {
  return agency.betaOnly ? (agency.rolloutNotice ?? BETA_ROLLOUT_NOTICE) : agency.rolloutNotice;
}
// N4 new-schedule (route), N21 new-schedule (agency)
/** The route card and the agency card word these for what they show (CIV-941). */
export const NEW_SCHEDULE_DATA_NOTICE = { route: "This route’s new schedule is still being verified.", agency: "This agency’s new schedule is still being verified." } as const;
// N5 corrected (route), N22 corrected (agency)
export const CORRECTED_DATA_NOTICE = { route: "We corrected an error in this route’s schedule.", agency: "We corrected an error in this agency’s schedule." } as const;
// N23 routes-outside-show
export const routesOutsideFiltersNotice = (count: number) => `${count} ${plural(count, 'route')} outside your filters.`;
// N24 routes-outside-hide
export const ROUTES_OUTSIDE_FILTERS_NOTICE = 'These routes are outside your filters.';
// N31 on-demand-not-mapped
/** An on-demand agency whose zone isn't drawn (the card's on-demand pill). */
export const ON_DEMAND_NOT_MAPPED_NOTE = "This agency’s on-demand service runs by request in a zone that isn’t on the map yet.";
// N32 zone-part-not-mapped
/** "This service's north zone isn't on the map yet." */
export const notOnMapYetNotice = (missing: string) => `This service’s ${missing.replace(/^the /, '')} isn’t on the map yet.`;
// N70 report-form-hint
export const REPORT_FORM_HINT = 'Choose a category, or click a card value to preselect its reason.';
// N69 report-needs-detail
export const REPORT_NEEDS_FREQUENCY_DETAIL = 'Select at least one frequency detail.';
// N69 report-needs-reason
export const REPORT_NEEDS_REASON = 'Select a reason or describe what is wrong.';

// ---- History ----
// N53 history-trip-time
/** Ryan's wording, 2026-11-12 (CIV-1127): about the length of the frequency box's sentence. */
export const HISTORY_TRIP_TIME_NOTE = 'This compares one typical weekday trip, end to end, over the same stops and path.';
// N56 history-order
export const HISTORY_ROUTE_ORDER_NOTE = 'Biggest changes first';
// History's own labels, moved here with the same words (CIV-451, approved by Ryan 2026-11-13).
/** The History panel's title. */
export const HISTORY_TITLE = 'Historical service';
/** The History button's screen-reader name, off and on. */
export const HISTORY_BUTTON_LABEL = 'History';
export const HISTORY_BUTTON_ACTIVE_LABEL = backLinkLabel(BACK_PLACES.frequencyMap);
/** The agency card's back link in History: the map's word for the agency list (CIV-1462). */
export const HISTORY_BACK_TO_AGENCIES = BACK_PLACES.agencies;
/** The year slider's hover hint and screen-reader name. */
export const HISTORY_YEAR_HINT = 'Older to newer';
export const HISTORY_YEAR_LABEL = 'History year';
/** The route chart's expand button and its window's screen-reader name. */
export const HISTORY_EXPAND_CHART = 'Expand chart';
export const HISTORY_CHART_LABEL = 'Route history chart';
/** The search box in History before an agency is open. */
export const HISTORY_AGENCY_SEARCH_PLACEHOLDER = searchPlaceholder('an agency');
/** Ryan's wording (CIV-1127): the frequency change box's sentence on weekdays. */
export const HISTORY_FREQUENCY_CHANGE_NOTE = 'This compares the oldest and newest weekday schedules available for this route.';
/** The frequency change box's sentence on Saturday or Sunday (Ryan approved word for word, CIV-1436, 2026-11-13; the weekday sentence stays his CIV-1127 wording). */
export const historyWeekendFrequencyChangeNote = (day: 'Saturday' | 'Sunday') =>
  `This compares the oldest and newest ${dayInSentence(day)} schedules available for this route.`;
/** A History row whose weekend day has no trips at all: docs/style/TEXT.md's approved "a route that doesn't run reads 'no trips'" (CIV-1251). */
export const HISTORY_NO_TRIPS_LABEL = 'no trips';
/** Above an agency's History list when no route has the picked weekend day's values by time of day (Ryan approved word for word, CIV-1436, 2026-11-13). */
export const historyWeekendPeriodsMissingNote = (day: 'Saturday' | 'Sunday') =>
  `${day} values by time of day aren’t available for this agency yet.`;

// ---- Map ----
// N46 networks-failed
export const networksFailedText = (count: number) => `${countOf(count, 'agency', 'agencies')} couldn’t load`;
// N46 networks-failed (hover)
/** The agencies' names: "TTC and YRT couldn't load." */
export const networksFailedHint = (names: readonly string[]) => `${joinList(names)} couldn’t load.`;
// N45 networks-loading
export const networksLoadingText = (loaded: number, requested: number) => `Loading ${countText(loaded)} of ${countOf(requested, 'agency', 'agencies')}…`;
// N34 on-demand-failed
export const ON_DEMAND_AREAS_FAILED = loadErrorText('on-demand areas');
// N121 map-errors (phones): one pill in place of the map's error notices; tapping it lists them (CIV-1057, Ryan's pick).
export const MAP_ERRORS_PILL = 'Error';
// N122 map-errors-title (phones): the title of the card the "Error" pill opens (CIV-1057, approved by Ryan).
export const MAP_ERRORS_TITLE = 'Map errors';
// N33 removed (Ryan, 2026-10-27: scheduled service and Live carry no such notice; CIV-1063 adds a per-agency one).
// N47 link-copied
export const LOCATION_URL_COPIED = 'Location link copied.';
// N47 copy-denied
export const CLIPBOARD_DENIED = "The link couldn’t be copied. Clipboard access was denied.";
// N48 location-denied
export const LOCATION_DENIED = "Location access was denied. Check your browser’s site permissions.";
// N49 approximate-location
export const approximateLocationHint = (city?: string | null) => (city
  ? `The map shows the approximate area of ${city}. Your precise location wasn’t available.`
  : "The map shows an approximate location. Your precise location wasn’t available.");
// N50 location-timeout
export const LOCATION_TIMED_OUT = 'Finding your location took too long. Try again.';
// N50 location-unavailable
export const LOCATION_UNAVAILABLE = "Your location couldn’t be found. Check your device’s location services.";

// ---- Map image export ----
/** N57 and N58 open with the same sentence (CIV-1077). */
const MAP_STILL_LOADING = 'The map is still loading.';
// N58 export-timeout, N59 export-no-routes, N60 export-failed-networks
/** Why an image can't be saved yet, by reason (utils/mapExport.ts). */
export const MAP_EXPORT_BLOCKED_MESSAGES = {
  timeout: `${MAP_STILL_LOADING} Try again in a moment to get every route in the image.`,
  // Only when the view has no route data; routes hidden by filters still save.
  'no-routes': "There’s no transit data in this view to save. Move the map to an area with service and try again.",
  'failed-networks': "Some agencies’ routes didn’t load. Reload the page and try again to get every route in the image.",
} as const;
// N61 export-not-ready
export const MAP_EXPORT_NOT_READY = "The map wasn’t ready. Try again in a moment.";
// N57 export-waiting
export const MAP_EXPORT_WAITING = `${MAP_STILL_LOADING} The image will save once every route is drawn.`;

// ---- Site ----
// N62 update-available
export const UPDATE_AVAILABLE_NOTICE = 'A newer version of this page is available.';
// N63 analytics-prompt
export const ANALYTICS_CONSENT_PROMPT = 'Optional analytics help improve Atlas.';
// N64 analytics-setting
export const ANALYTICS_SETTING_NOTE = 'Optional analytics help us understand which parts of Atlas people use.';
// N68 view-error
export const VIEW_ERROR_TEXT = "This view couldn’t load because of an error.";
// N68 map-error
export const MAP_ERROR_TEXT = "The map couldn’t be shown because of an error.";
// N71 not-found
export const NOT_FOUND_TITLE = 'This page took the wrong route';
// N71 not-found
export const NOT_FOUND_BODY = "We couldn’t find that page.";
// N72 page-not-found
export const AGENCY_PAGE_NOT_FOUND_TITLE = 'No page for this agency';
// N72 page-not-found
export const AREA_PAGE_NOT_FOUND_TITLE = 'No page for this area';
// N72 page-not-found. A region is a state or province (CIV-1614).
export const REGION_PAGE_NOT_FOUND_TITLE = 'No page for this region';
// N72 page-not-found
export const NO_FREQUENCY_PAGE_BODY = 'This address has no frequency page.';
/** Every in-page link that sends people to the map: page heroes, empty and not-found pages (the header keeps "Go to Atlas", #1509) (CIV-1594; Ryan, 2026-11-15, CIV-1703). */
export const MAP_LINK = 'Try Atlas';

// N17 route-no-service-day, N26 agency-no-service-day (Ryan; "trips", as N8, CIV-1077)
export const noServiceOnDayNotice = (subject: 'route' | 'agency', day: string) => noTripsText(subject, `on ${isDayType(day) ? dayPlural(day) : day}`);
// N35 stop-no-routes-in-period (Ryan)
export const stopNoRoutesNotice = (periodRange: string) => `No routes stop here from ${keepRangeTogether(periodRange)}.`;
// N36 stop-not-found (Ryan)
export const STOP_NOT_FOUND = "This stop couldn’t be found. It may have been moved or removed.";
// N51 night-failed (Ryan)
export const NIGHT_LOAD_FAILED = loadErrorText('overnight service');
/** N52 night-empty (Ryan): the Night view's own rule, fixed at 2-5 AM (FREQUENCY_RULES rule 10), at its 30 or 60. A real search with no match keeps N52's old text. */
export const nightNoRoutesNotice = (frequency: number) => `No routes here run ${headwayOrBetter(frequency)} from 2–5 AM.`;
// N54 history-failed (Ryan; with RETRY_HINT in the sidebar)
export const HISTORY_LOAD_FAILED = loadErrorText('history');
// N55 history-route-not-covered (Ryan)
export const HISTORY_ROUTE_NOT_COVERED = 'This route has no past schedules in History yet.';
// N18 route-not-found (Ryan)
export const ROUTE_NOT_FOUND = "This route couldn’t be found. It may have been renumbered or removed.";
// N27 agency-routes-failed (Ryan)
export const AGENCY_ROUTES_FAILED = `${loadErrorText("this agency’s routes")} ${RETRY_HINT}`;
// N30 agency-not-found (Ryan)
export const AGENCY_NOT_FOUND = "This agency couldn’t be found.";
// On-demand service from a link that Atlas doesn't have (#1191). Proposed wording, waiting on Ryan's word-for-word OK.
export const ON_DEMAND_NOT_FOUND = "This on-demand service couldn’t be found.";

// ---- Live ----
// Live's notice, empty-state and error texts (CIV-1045), word for word as they were in the Live components.
// Live's own figure wording stays in shared/liveWording.ts.

/** A Live section that failed to draw (its error boundary). */
export const liveDrawError = (what: string) => `${what} could not be drawn.`;
export const LIVE_METHOD_DRAW_ERROR = `${METHOD_TITLE} could not be drawn.`;
/** `agency`: the agency's short name (useLiveAgencyName), never the address in capitals (CIV-1160 question 7). */
/** Live covers none of an agency's routes: the Live map's line, also the report page's (Ryan, item 40, 2026-11-17). */
const liveCoversNoRoutes = (agency: string) => `Live doesn’t cover any ${agency} routes.`;
/** Live doesn't cover this route: the Live map's line, also the report page's (Ryan, item 40, 2026-11-17). */
const liveDoesNotCover = (agency: string, route: string) => `Live doesn’t cover ${agency} ${route}.`;
export const liveNoAgencyAnalysis = (agency: string) => liveCoversNoRoutes(agency);
export const liveNoRoute = (route: string, agency: string) => liveDoesNotCover(agency, route);
export const LIVE_API_NO_ANSWER = 'The Live API did not answer. Start Live with "npm run live" and open this page on the address it prints.';
export const LIVE_OFF_TITLE = 'Live is switched off in this copy of Atlas';
/** The switched-off page's line, in parts around its two code snippets. */
export const LIVE_OFF_BODY = { start: 'Live only runs on your own computer. Start it with', command: 'npm run live', middle: 'and open', path: LIVE_PATH, end: 'on the address it prints.' } as const;

/** Why a picked route has no vehicles on the Live map. */
export function liveRouteEmptyNotice(agencyName: string, routeShortName: string, polled: boolean, followed: readonly string[]): string {
  if (!polled) {
    return followed.length > 0
      ? `${liveDoesNotCover(agencyName, routeShortName)} It covers ${agencyName} routes ${joinList(followed)}.`
      : liveCoversNoRoutes(agencyName);
  }
  return `No ${agencyName} ${routeShortName} vehicles are running right now.`;
}
export const LIVE_NO_VEHICLES_ON_ROUTE = 'No vehicles on this route';
export const LIVE_NO_ROUTE_MATCHES = 'No routes match your search.';
export const LIVE_REPLACEMENT_BUSES = 'Replacement buses: all figures describe the buses running this route';
/** CIV-1795: the approved "can’t be shown right now" line (CIV-941). */
export const LIVE_FEED_INCOMPLETE = 'These figures can’t be shown right now.';
/** The Live route card when Live has no analysis for the route, so "Right now" can't show (Ryan approved word for word, CIV-1413 B, 2026-11-14). */
export const LIVE_ROUTE_FIGURES_UNAVAILABLE = 'Live figures for this route aren’t available yet.';
/**
 * CIV-1768 (Ryan, 2026-11-16: "Unable to load then a countdown until it retries", then "Yes" to "Unable to load ·
 * Retrying in 11s" in the map's loading pill): every Live feed in view failed; the countdown is to the next poll.
 */
export const LIVE_UNABLE_TO_LOAD = 'Unable to load';
export const liveRetryCountdown = (seconds: number) => `Retrying in ${seconds}s`;
export const liveUnableToLoadPill = (seconds: number) => `${LIVE_UNABLE_TO_LOAD} · ${liveRetryCountdown(seconds)}`;
/** Some feeds in view failed while others work: "Live buses from TTC and YRT can't be shown right now." (approved, CIV-941 #57). */
export const liveUnreachableText = (agencyNames: readonly string[]) => `Live buses from ${joinList(agencyNames)} can’t be shown right now.`;
/** CIV-1795: as the approved "Delay not measured" (CIV-1601). */
export const LIVE_GAP_NOT_SEEN = 'Gap not measured';

export const LIVE_NO_WEEK_COMPARISON = 'No comparison with last week';
export const LIVE_NO_STOPS_MEASURED = 'No stops were measured.';
export const LIVE_NO_STOP_TO_RANK = 'No stop has enough departures to rank.';
export const LIVE_NO_STOP_TO_RANK_YET = 'No stop has enough departures to rank yet.';
export const LIVE_NO_STRETCH_STANDS_OUT = 'No stretch stands out on the analysed routes.';
/** Extra wait's empty message: the measure's definition, kept with its 15 min (Ryan, CIV-1160 question 3, 2026-11-13). */
export const LIVE_NO_FREQUENT_STOP = `No stop on this route has a vehicle ${headwayOrBetter(15)} at this time of day.`;
/** The Extra wait section's intro: what the measure is and where it applies. */
export const LIVE_EXTRA_WAIT_INTRO = `How much longer riders wait than scheduled, where a vehicle is due ${headwayOrBetter(15)}.`;
export const LIVE_NOTHING_LINKED = 'Nothing measured here is linked to it';
export const LIVE_LESS_EXACT_HERE = 'Less exact here: vehicles report their location less often';
export const LIVE_FEW_MEASUREMENTS = 'Few measurements: treat with care.';
export const LIVE_NO_DEPARTURES_IN_PERIOD = 'No departures in this part of the day.';
/** A kind of day with no good recordings this week ("No weekends with good recordings this week."). */
export const liveNoGoodDays = (dayKindLabel: string) => `No ${dayKindLabel.toLowerCase()} with good recordings this week.`;
export const LIVE_TOO_FEW_SCHEDULED_DEPARTURES = 'Not enough departures at stops with a scheduled time.';
export const LIVE_TOO_FEW_DEPARTURES = 'too few departures';
/** Run time with too few trips for a time of day ("in the AM peak"). */
export const liveTooFewTrips = (bandWords: string) => `Too few trips were measured ${bandWords} to draw this.`;

/** Live: one agency's feed failed ("<message> It will retry automatically."). */
/** Live: nothing running on any followed route in view. */
export const LIVE_NOTHING_ACTIVE = 'No vehicles running on the routes Live covers here';
export const LIVE_NOTHING_ACTIVE_HINT = 'Vehicles appear here when one is running on a route Live covers.';
/**
 * The Live map's report titles (CIV-1795): "TTC 504" for a route, "TTC 504 · Bus 8123" for a vehicle, in the vehicle
 * card's own name ("Vehicle 3" with no usable number). `agency` is null while the agency list loads ("Loading…") and
 * when the agency isn't in it ("This agency couldn’t be found.", N30).
 */
export function liveReportFlagTitle(agency: string | null, loaded: boolean, routeShortName: string, vehicleName?: string): string {
  if (!agency) return loaded ? AGENCY_NOT_FOUND : LOADING_LABEL;
  return `${agency} ${routeShortName}${vehicleName ? ` · ${vehicleName}` : ''}`;
}
/** The Live map's list of the routes it covers in view (CIV-1795: "covers", Atlas's own verb). */
export const LIVE_COVERED_ROUTES_HEADING = 'Routes Live covers here';
// N25 listing-ended (Ryan's exact text, CIV-1011; shown since CIV-1055). Defined beside the agency page text it shares.
export { listingEndedNotice, listingEndedPageLine, listingEndHasPassed } from '../../shared/agencyPages';

/** CIV-1052: a stop's own route that has no trips at the stop in the whole chosen period (Ryan, wording approved 2026-10-27). */
export function stopRouteNoTripsNotice(periodRange: string): string {
  return `No trips from ${keepRangeTogether(periodRange)}`;
}

// ---- Explainers: the Learn more panels (InfoPanel), E1 to E8 ----
/** Each panel's code and title; the panel text is below, in the panel's own order. */
export const EXPLAINERS = {
  'outdated-schedule': { code: 'E1', title: 'Outdated schedule' },
  'new-schedule-data': { code: 'E2', title: 'New schedule data' },
  'corrected-data': { code: 'E3', title: 'Corrected data' },
  'beta-rollout': { code: 'E4', title: 'Beta testing' },
  'route-data-quality': { code: 'E5', title: 'Route data quality' },
  'no-route-shape': { code: 'E6', title: 'Route map unavailable' },
  'edge-gap-allowance': { code: 'E7', title: 'First and last trips' },
  'weekday-variation': { code: 'E8', title: 'Weekday variation' },
  'route-rating': { code: 'E9', title: 'Route rating' },
} as const;
export type HelpTopic = keyof typeof EXPLAINERS;

// ---- Explainer paragraph 1, one per explainer (Ryan's approved text, CIV-1051) ----
// Paragraphs 2 and 3 are shared pieces, below. E1's lead is the notice plus EXPIRED_FEED_EXPLANATION;
// E3's is the agency's correction note; E6's is N7 itself.
// E1, N25 version (CIV-1051): "ends" before the listing-end date, "ended" from it on. Paragraphs 2 and 3 are N2's.
export function listingEndedPanelLead(agencyName: string, date: string, ended: boolean): string {
  const { primary } = agencyNames(agencyName).card;
  return `${agencyPossessiveSentenceStart(primary)} scheduled service for most routes ${ended ? 'ended' : 'ends'} ${date}, and they have not released updated data. The map shows the last full week in their schedule, for every route.`;
}
// E2: the date is the day the schedule went on the map.
export const newScheduleDataLead = (agencyName: string, onMapOn?: string | null) =>
  `${agencyPossessiveSentenceStart(agencyNames(agencyName).card.primary)} new schedule went on the map${onMapOn ? ` on ${onMapOn}` : ''}. It may have errors we haven’t found yet.`;
// E4
export const betaRolloutLead = (agencyName: string) => onlyOnBetaText(agencySentenceStart(agencyNames(agencyName).card.primary));
// E5
export const ROUTE_DATA_QUALITY_LEAD = "Part of this route’s line on the map may be missing or drawn in the wrong place.";
// E7: N14 itself, then the allowance (CIV-1077); 10 minutes is EDGE_GAP_ALLOWANCE_MINUTES (pipeline/transit-phase2.ts).
export const EDGE_GAP_ALLOWANCE_LEAD = `${FIRST_LAST_TRIP_ALLOWANCE_HINT} That trip can come up to 10 minutes later than usual.`;
// E8: N1 itself, then one more sentence.
export const WEEKDAY_VARIATION_LEAD = `${WEEKDAY_VARIATION_NOTICE} Some weekdays run more or less often than others.`;
// E9 (CIV-1199, Ryan 2026-11-14, word for word): N12 with its live values, then one more sentence.
export const routeRatingLead = (filterNotice: string) => `${filterNotice} A part of the route runs less often than the rest.`;

// ---- Explainer pieces (CIV-1061): every paragraph 2 and 3 sentence, written once ----
/** Where a paragraph-3 piece's links go, in order. */
export type ExplainerLink = 'agency-website' | 'report-schedule' | 'report-data';
type ExplainerPieceDef = {
  /** Permanent code (X1, X2…), never reused, like N and E codes. */
  code: string;
  text: string;
  /** Paragraph 3 only: the links under it. */
  links?: readonly ExplainerLink[];
  /** Paragraph 3 only: shown only when the agency has a website (its only link is the website). */
  needsWebsite?: boolean;
};
export const EXPLAINER_PIECES = {
  // Paragraph 2: what we're doing about it.
  WEEKLY_CHECK: { code: 'X1', text: "We check for new schedules every week." },
  /** N76: the kept-by-hand version of WEEKLY_CHECK. */
  MANUAL_FEED: { code: 'X2', text: "This agency doesn’t publish a feed we can check automatically. We update it when a newer file is provided and verified." },
  VERIFYING_NEW_SCHEDULE: { code: 'X3', text: "We’re verifying it for missing service and other errors, and we’ll correct anything we find." },
  CORRECTED_BEFORE_MAP: { code: 'X4', text: "We correct errors like this before a schedule goes on the map." },
  VERIFYING_BETA: { code: 'X5', text: "We’re still verifying its schedule, and some routes or times may change." },
  FREQUENCY_FROM_TIMETABLE_LINE_WRONG: { code: 'X6', text: "We still show the route. Its frequency on this card comes from the schedule and is still accurate." },
  FREQUENCY_FROM_TIMETABLE_NO_LINE: { code: 'X7', text: "We still show the route on this card. Its frequency comes from the schedule and is still accurate." },
  MIDDAY_GAPS: { code: 'X8', text: "Many routes start or end their day with one longer gap. Gaps in the middle of the day don’t get this allowance." },
  WEEKDAYS_SEPARATE: { code: 'X9', text: "We check each weekday separately, which means one busier day can’t make the route look more frequent than it usually is." },
  // Paragraph 3: what the reader can do.
  AGENCY_WEBSITE_NEWER: { code: 'X10', text: "A newer schedule may be on the agency’s website.", links: ['agency-website', 'report-schedule'] },
  AGENCY_WEBSITE_CURRENT: { code: 'X11', text: "The agency’s website has its current schedule.", links: ['agency-website'], needsWebsite: true },
  AGENCY_WEBSITE_EACH_DAY: { code: 'X12', text: "The agency’s website has each day’s schedule.", links: ['agency-website'], needsWebsite: true },
  REPORT_BELOW: { code: 'X13', text: "If something still looks wrong, report it below.", links: ['report-data'] },
  REPORT_WITH_FLAG: { code: 'X14', text: "If something looks wrong, report it with the flag on this card." },
  // Paragraph 2 of E9 (CIV-1199), after X9.
  STRETCH_AND_BRANCHES_SEPARATE: { code: 'X15', text: "We check the shared stretch and each branch separately, which means one busier part can’t make the whole route look more frequent than it is." },
} as const satisfies Record<string, ExplainerPieceDef>;
export type ExplainerPiece = keyof typeof EXPLAINER_PIECES;
export const pieceText = (piece: ExplainerPiece): string => EXPLAINER_PIECES[piece].text;

/** E1 opened from N3 (a schedule kept by hand) swaps its paragraph 2. */
export type ExplainerLayoutKey = HelpTopic | 'outdated-schedule-manual';
/** Each explainer after its own paragraph 1: its paragraph-2 piece(s), then at most one paragraph-3 piece. */
export const EXPLAINER_LAYOUT: Record<ExplainerLayoutKey, { p2: readonly ExplainerPiece[]; p3?: ExplainerPiece }> = {
  'outdated-schedule': { p2: ['WEEKLY_CHECK'], p3: 'AGENCY_WEBSITE_NEWER' },
  'outdated-schedule-manual': { p2: ['MANUAL_FEED'], p3: 'AGENCY_WEBSITE_NEWER' },
  'new-schedule-data': { p2: ['VERIFYING_NEW_SCHEDULE'], p3: 'AGENCY_WEBSITE_CURRENT' },
  'corrected-data': { p2: ['CORRECTED_BEFORE_MAP'], p3: 'REPORT_BELOW' },
  'beta-rollout': { p2: ['VERIFYING_BETA'] },
  'route-data-quality': { p2: ['FREQUENCY_FROM_TIMETABLE_LINE_WRONG'], p3: 'REPORT_WITH_FLAG' },
  'no-route-shape': { p2: ['FREQUENCY_FROM_TIMETABLE_NO_LINE'], p3: 'REPORT_WITH_FLAG' },
  'edge-gap-allowance': { p2: ['MIDDAY_GAPS'] },
  'weekday-variation': { p2: ['WEEKDAYS_SEPARATE'], p3: 'AGENCY_WEBSITE_EACH_DAY' },
  'route-rating': { p2: ['STRETCH_AND_BRANCHES_SEPARATE'], p3: 'REPORT_WITH_FLAG' },
};

/**
 * Which explainer each notice's Learn more opens (N-code to panel). Every Learn-more notice is listed here; components
 * ask explainerFor(code) instead of naming a panel, and a test fails on a Learn more with no pairing.
 */
export const NOTICE_EXPLAINERS = {
  N1: 'weekday-variation',
  N2: 'outdated-schedule',
  N3: 'outdated-schedule',
  N4: 'new-schedule-data',
  N5: 'corrected-data',
  N6: 'route-data-quality',
  N7: 'no-route-shape',
  N14: 'edge-gap-allowance',
  /** CIV-1199 case 1: only when every row meets the filter but a part of the route doesn't (routeCardNotices learnMore). */
  N12: 'route-rating',
  /** An agency's own rollout note from its config (none set today); the beta-only notices link to beta instead. */
  N19: 'beta-rollout',
  N21: 'new-schedule-data',
  N22: 'corrected-data',
  N25: 'outdated-schedule',
} as const satisfies Record<string, HelpTopic>;
export type LearnMoreCode = keyof typeof NOTICE_EXPLAINERS;
export const explainerFor = (code: LearnMoreCode): HelpTopic => NOTICE_EXPLAINERS[code];

// N124 on-demand-shaded-area: the on-demand card's line when the map shades this service's area (CIV-941).
export const ON_DEMAND_SHADED_AREA = 'The shaded map area shows where this on-demand service operates.';

// N126 on-demand-partial: on-demand coverage is partial, so a place with no shading isn't read as having no service. Shown as
// the map key's last line and under On-demand in the Mode menu (CIV-23; Ryan's word-for-word OK, 2026-11-11).
export const ON_DEMAND_PARTIAL_COVERAGE = 'Some on-demand zones aren\u2019t on the map yet.';

// N125 on-demand-pickup: how riders board an on-demand zone (CIV-941, moved here from shared/onDemandAvailability.ts unchanged).
/**
 * One sentence on how riders board, specific to the selected zone (or the
 * service when no zone is selected). Returns null when the data says nothing.
 */
export function onDemandPickupSentence(service: OnDemandServiceDetails, areaName: string | undefined): string | null {
  const resolved = resolveOnDemandZone(service, areaName);
  const stops = (service.stopFeatures ?? []).filter(stop => {
    const zones = onDemandStopZoneNames(service, stop.properties);
    return areaName ? zones.includes(areaName) : zones.length === 0;
  });
  const count = stops.length;
  const allTransferPoints = count > 0 && stops.every(stop => (stop.properties as OnDemandPickupStop | undefined)?.serviceType === 'on-demand-transfer-point');
  const scope = areaName ? 'This zone' : 'This service';
  const pickup = resolved.pickup;
  let sentence: string | null = null;
  switch (pickup?.method) {
    case 'door-to-door':
      sentence = 'Pickups and drop-offs are door to door within the shaded area.';
      break;
    case 'curb-to-curb':
      sentence = 'Pickups and drop-offs are curb to curb within the shaded area.';
      break;
    case 'fixed-stops':
      sentence = count > 0
        ? `Pickups and drop-offs are at ${countOf(count, 'set stop', 'set stops')}, shown on the map.`
        : 'Pickups and drop-offs are at set stops, not door to door.';
      break;
    case 'virtual-stops':
      sentence = count > 0
        ? `Pickups and drop-offs are at ${countOf(count, 'virtual stop', 'virtual stops')}, shown on the map.`
        : 'Pickups and drop-offs are at virtual stops, not door to door.';
      break;
    case 'connection-points':
      sentence = 'This area is a connection point.';
      break;
    case 'transfer-point-trips':
      sentence = count > 0
        ? `Every trip starts or ends at this zone’s ${plural(count, 'transfer point')}, shown on the map.`
        : 'Every trip starts or ends at a transfer point.';
      break;
    default:
      if (count > 0) {
        sentence = `${scope} has ${allTransferPoints ? countOf(count, 'transfer point', 'transfer points') : countOf(count, 'stop', 'stops')}, shown on the map.`;
      }
  }
  if (!sentence) return null;
  return pickup?.note ? `${sentence} ${pickup.note}` : sentence;
}

// CIV-1774 (Ryan, 2026-11-16: "in one place only for grammar reasons /branding"): button, link, tag, control and
// heading labels that were typed into their components, moved here word for word.
/** The shared page header's link to the map. */
export const GO_TO_ATLAS_LABEL = 'Go to Atlas';
/** The page header's nav, for screen readers. */
export const SITE_NAV_LABEL = 'Site navigation';
export const SITE_FOOTER_LABEL = 'Site footer';
export const FOOTER_LINKS_LABEL = 'Footer links';
export const LEGAL_LINKS_LABEL = 'Legal links';
/** A long page's contents list. */
export const ON_THIS_PAGE_LABEL = 'On this page';
export const ZOOM_IN_LABEL = 'Zoom in';
export const ZOOM_OUT_LABEL = 'Zoom out';
export const CLEAR_REGION_FILTERS_LABEL = 'Clear region filters';
/** The frequency split bar's screen-reader name. */
export const ROUTES_BY_MIDDAY_FREQUENCY_LABEL = 'Routes by weekday midday frequency';
/** A research page's method section. */
export const METHOD_HEADING = 'Method';
/** The stop card's section. */
export const NEARBY_ROUTES_LABEL = 'Nearby routes';
export const ROUTE_CHOOSER_LABEL = 'Route chooser';
export const LIVE_DATA_AVAILABLE_LABEL = 'Live data available';
/** The agency card's link to the agency's own site, its screen-reader name and its hover hint. */
export const SOURCE_LINK_LABEL = 'Source';
export const SOURCE_LINK_ARIA_LABEL = 'Source (opens in a new tab)';
export const OPENS_IN_NEW_TAB_HINT = 'Opens in a new tab';
/** The report form's buttons. */
export const CANCEL_LABEL = 'Cancel';
export const CHANGE_LABEL = 'Change';
export const FIRST_LAST_TRIP_ALLOWANCE_LABEL = 'About the first-or-last-trip allowance';
export const MAP_LEGEND_LABEL = 'Map legend';
/** A map key's screen-reader name. */
export const MAP_COLOURS_LABEL = 'Map colours';
export const EXPAND_SCHEDULE_LABEL = 'Expand schedule';
export const SCHEDULE_DIRECTION_LABEL = 'Schedule direction';
/** The map's filter controls. */
export const FILTERS_LABEL = 'Filters';
export const FILTERS_BOTH_MAPS_LABEL = 'Filters for both maps';
export const MORE_FILTERS_LABEL = 'More filters';
/** The settings panel's switches. */
export const TOGGLE_DARK_MODE_LABEL = 'Toggle light/dark mode';
export const TOGGLE_HIGH_CONTRAST_LABEL = 'Toggle high contrast mode';
export const TOGGLE_LEGEND_LABEL = 'Toggle persistent legend';
export const TOGGLE_DATA_SAVER_LABEL = 'Toggle data saver';
/** The connections bar's controls (CIV-1353). */
export const WAIT_LABEL = 'Wait';
export const WALK_LABEL = 'Walk';
export const SIDE_LABEL = 'Side';
export const OVERNIGHT_FREQUENCY_LABEL = 'Overnight frequency';
export const TIME_WINDOW_LABEL = 'Time window';
/** The map's agency filter chip and its two bulk buttons. */
export const AGENCIES_FILTER_LABEL = 'Agencies';
export const SELECT_ALL_LABEL = 'All';
export const SELECT_NONE_LABEL = 'None';
/** The Compare button and its screen-reader name. */
export const COMPARE_LABEL = 'Compare';
export const COMPARE_ARIA_LABEL = 'Compare two maps';
export const ROUTES_IN_VIEW_LABEL = 'Routes in view';
export const AGENCIES_IN_VIEW_LABEL = 'Agencies in view';
/** The top bar's logo and views menu. */
export const ATLAS_HOME_LABEL = 'Atlas home';
export const MORE_VIEWS_LABEL = 'More Atlas views';
/** The phone views menu's name when no named view is on. */
export const MORE_LABEL = 'More';
export const LIVE_TAB_LABEL = 'Live';
/** Tags beside an agency or a What's New item. */
export const LIVE_TAG = 'Live';
export const HISTORY_TAG = 'History';
/**
 * The agency list's "All" pill hover: the filter pills it turns off, named (Ryan, CIV-1795 question 1, option a):
 * "Clear the Live and History filters", "Clear the Live, History and Outdated filters". Was "Clear status filters".
 */
export const clearAgencyFiltersTitle = (pills: readonly string[]): string => `Clear the ${joinList(pills)} filters`;
/** The agency list's Sources view (CIV-1795: no "GTFS feed" jargon, as About Atlas says "published agency schedules"). */
export const SOURCES_LEAD = 'We use the schedules transit agencies publish, usually downloaded directly from each agency.';
export const SOURCES_FALLBACK = 'When we can’t rely on an agency’s own copy, we may use a public copy from:';
export const NEW_TAG = 'New';
export const DRAFT_TAG = 'Draft';
export const LOCAL_STOP_WITHIN_LABEL = 'Local stop within';
/** Bustang's card where no local route connects within its widest window (60 min). */
export const noLocalRouteWithinText = (window: string) => `No local route within ${window}.`;
export const notWithinLead = (window: string) => `Not within ${window}: `;
/** The analytics prompt. */
export const TOGGLE_ANALYTICS_LABEL = 'Toggle Google Analytics';
export const ANALYTICS_CONSENT_LABEL = 'Analytics consent';
export const READ_PRIVACY_POLICY_LABEL = 'Read the Privacy Policy';
export const SHOW_MORE_RESULTS_LABEL = 'Show more results';
/** The recent searches list. */
export const CLEAR_LABEL = 'Clear';
/** A card's link to more about it: the agency card's link to its agency page (CIV-1780, Ryan: "Details", as the stop card's; was "About") and an on-demand service's source. */
export const DETAILS_LABEL = 'Details';
export const SEE_ALL_CHANGES_LABEL = 'See all changes';
/** About's link to the research (CIV-1780, Ryan: title case, as its heading). */
export const EXPLORE_RESEARCH_LABEL = 'Explore Research';
export const WHAT_ATLAS_SHOWS_LABEL = 'What Atlas shows';
export const FEEDBACK_LABEL = 'Feedback';
/** Section headings and table columns on the agency, area and index pages. */
export const AREAS_HEADING = 'Areas';
export const AGENCIES_FREQUENCY_HEADING = 'Agencies and Weekday Frequency';
export const AGENCY_COLUMN = 'Agency';
export const ROUTES_FREQUENCY_HEADING = 'Routes and Weekday Frequency';
export const ROUTE_COLUMN = 'Route';
export const SERVICES_HEADING = 'Services';

// CIV-1781: Live's labels, moved here word for word as CIV-1774 moved the rest ("Toggle light mode" now reads
// TOGGLE_DARK_MODE_LABEL, CIV-1780). FILTERS_LABEL, DAY_LABEL, MAP_COLOURS_LABEL and ROUTE_COLUMN are shared.
export const LAST_WEEK_COLUMN = 'Last week';
/** The two-stop column on the Live agency page (Ryan, CIV-1795 question 10, option a; was "Stretch"). */
export const STRETCH_COLUMN = 'Between stops';
export const ROUTES_HEADING = 'Routes';
export const DIRECTION_SHOWN_LABEL = 'Direction shown';
export const VIEW_LABEL = 'View';
export const MEASURE_LABEL = 'Measure';
export const LOADING_LABEL = 'Loading…';
export const ROUTE_MENU_LABEL = 'Route';
export const LIVE_AT_STOP_LABEL = 'Live at this stop';
export const NOTE_COLUMN = 'Note';
export const DELIVERED_BY_DAY_LABEL = 'Share of scheduled trips that ran, day by day';
export const STOP_COLUMN = 'Stop';
export const SCHEDULED_EVERY_COLUMN = 'Scheduled every';
export const GAPS_COLUMN = 'Gaps';
export const DEPARTURES_COLUMN = 'Departures';
export const BY_HOUR_HEADING = 'By Hour of the Day';
export const STOPS_MOST_OFTEN_LATE_LABEL = 'The stops most often late';
export const HOUR_COLUMN = 'Hour';
export const STARTS_AT_COLUMN = 'Starts at';
export const SCHEDULED_COLUMN = 'Scheduled';
export const USUALLY_COLUMN = 'Usually';
export const TRIPS_COLUMN = 'Trips';
/** A Live route page's three views (CIV-1795: "Full report", as the page calls itself; Ryan, question 3, option b: "Overview"). */
export const LIVE_SUMMARY_VIEW = 'Summary';
export const LIVE_OVERVIEW_VIEW = 'Overview';
export const LIVE_FULL_REPORT_VIEW = 'Full report';
export const LIVE_EVERY_STOP_LINK = `Every stop, in ${LIVE_FULL_REPORT_VIEW}`;
/** The Live agency page's section intros (CIV-1795; Ryan, question 11, option a). */
export const LIVE_AGENCY_ROUTES_INTRO = 'Every route Live covers, worst first.';
export const LIVE_DELAY_STARTS_INTRO = 'Routes where delay jumps between two stops and stays up, and the minutes it usually adds there.';
export const LIVE_BUNCHING_FORMS_INTRO = 'Routes where gaps too close together or too far apart jump between two stops and stay up.';
/** The Live vehicle card's delay row (Ryan, CIV-1795 question 2, option a; was "Schedule"). */
export const LIVE_STATUS_LABEL = 'Status';
// CIV-1803: the rest of Live's labels, captions and intros, moved here word for word from the Live components.
/** The week table's other column, beside LAST_WEEK_COLUMN. */
export const THIS_WEEK_COLUMN = 'This week';
/** The route pages' "Along the route" section intro. */
export const LIVE_ALONG_ROUTE_INTRO = 'Each stop coloured twice, over the whole day: how late cars typically leave it, and how often the gaps between cars are too close or too far apart. Hover or tap a stop for its figures.';
/** The Overview's line above the direction and time-of-day pills. */
export const LIVE_DIRECTION_PICK_NOTE = 'The direction you pick changes everything below. The figures above are the whole week, both directions.';
/** The Live agency page's two stretch tables. */
export const LIVE_DELAY_STRETCHES_CAPTION = 'Stretches that add the most delay';
export const LIVE_BUNCHING_STRETCHES_CAPTION = 'Stretches where bunching rises the most';
export const INCREASE_COLUMN = 'Increase';
/** The Full report's section intros. */
export const LIVE_BUILDUP_INTRO = 'How late vehicles leave each stop along the route, and where that delay jumps and stays up.';
export const LIVE_BUNCHING_INTRO = 'How often vehicles come too close together or too far apart, stop by stop, and where that starts.';
export const LIVE_RUN_TIME_INTRO = 'How long the trip takes against the schedule, by the hour it starts, over the stops every regular trip serves, so short turns count too.';
/** The Live charts' axis titles, marks and captions. */
export const MINUTES_LATE_AXIS = 'Minutes late';
export const LIVE_BUILDUP_CHART_CAPTION = 'How late vehicles usually leave each stop: above the line is late, below is early.';
export const SHARE_OF_GAPS_AXIS = 'Share of gaps';
export const LIVE_BUNCHING_CHART_CAPTION = 'How often vehicles arrive too close together or too far apart, at each stop.';
export const FORMS_HERE_MARK = 'Forms here';
export const BIGGEST_RISE_MARK = 'Biggest rise';
export const GAPS_THROUGH_DAY_HEADING = 'Gaps through the day';
export const EXTRA_MINUTES_AXIS = 'Extra minutes';
export const LIVE_EXTRA_WAIT_CHART_CAPTION = 'How much longer riders wait than the schedule says, at each stop.';
export const LIVE_EXTRA_WAIT_STOPS_CAPTION = 'Stops where riders wait longest compared with the schedule';
export const LIVE_LATE_STOPS_CAPTION = 'Stops ranked by the share of late departures';
/** The short list's caption, from the number of stops it lists (the dashboard's five). */
export const liveLateStopsTopCaption = (n: number): string => `The ${countWord(n)} stops with the highest share of late departures`;
export const LATE_PERCENT_LEGEND = 'Late %';
/** The Service delivered table and tile: trips that ran, by day. */
export const RAN_COLUMN = 'Ran';
export const LIVE_DELIVERED_CAPTION = 'How many of the scheduled trips ran, each day.';
/** Live's network view: the route menu's first choice and the week table's scope. */
export const ALL_ROUTES_LABEL = 'All routes';
/** Under the Live tool's left-panel tiles; the full rule is its hover text. */
export const LIVE_NOISE_CAPTION = 'Grey = within normal day-to-day change';
/** The Live route card's "Right now" figures. */
export const RIGHT_NOW_LABEL = 'Right now';
export const VEHICLES_LABEL = 'Vehicles';
export const LIVE_GAPS_FRONT_TO_BACK = 'Gaps, front to back (min)';
/** The Live map's link to the agency list filtered to Live agencies, and a stop card's recent arrivals. */
export const BROWSE_LIVE_AGENCIES_LINK = 'Browse all live agencies';
export const RECENTLY_SEEN_HERE = 'Recently seen here';

/** CIV-1786 (Ryan picked 1): a region page's line under an agency that only partly serves it, "1 route in West Virginia · 68 total". */
export const partOfAgencyRoutesNote = (here: number, place: string, total: number): string =>
  `${countOf(here, 'route', 'routes')} in ${place} · ${countText(total)} total`;
