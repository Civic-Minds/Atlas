/**
 * Every notice, empty-state, error and callout text the site shows, in one place (CIV-1045, Ryan: "one single page where
 * the entire site pulls from"). Components only call these; a guard test (noticeCopy.test.ts) fails on new inline text.
 * Live's texts stay with Live for now (Atlas Live's lane).
 *
 * Codes (CIV-1045): each notice has a permanent N-code and each Learn-more explainer an E-code, the same as on the
 * review page (_review/notices). A new text takes the next free number; numbers are never reused. Every notice with
 * Learn more names its explainer in NOTICE_EXPLAINERS, so the two can be checked against each other.
 */
import { joinList, plural } from '../../shared/overflowText';
import { formatStoredDate } from '../utils/format';
import { agencyNames } from '../utils/agencyName';
import { delayAmount, headwayAbout } from '../utils/headwayText';

// N2 timetable-ended, N3 manual-timetable-ended
/** Shared user-facing copy for every expired-feed notice. */
export function expiredFeedNotice(agencyName: string, expDateStr?: string, manualFeedSource = false): string {
  const { primary } = agencyNames(agencyName).card;
  const ended = `${primary}'s schedule ended${expDateStr ? ` on ${expDateStr}` : ''}.`;
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

// N13 part-period-filter
export function selectedRouteFilterNotice(options: {
  /** The route's own filter value for the period; without one the notice names no frequency. */
  headway?: number | null;
  activeRange: string;
  periodRange: string;
  /**
   * The period's parts outside the run of service, with their times formatted (N13, Ryan): "with no service from 6–7
   * AM", "and less often after 9 AM", or "and not from 6–7 AM" where the data can't tell. Without it, the general wording.
   */
  outside?: Array<{ service: 'none' | 'less' | 'unknown'; /** A part at the start: "6–7 AM". */ range?: string; /** A part at the end: "9 AM". */ after?: string }>;
}): string {
  const runs = options.headway != null ? `This route runs ${headwayAbout(options.headway)}` : 'This route runs';
  const lead = `${runs} from ${keepRangeTogether(options.activeRange)}`;
  if (!options.outside?.length) return `${lead}, but not throughout the selected ${keepRangeTogether(options.periodRange)} period.`;
  const where = (part: NonNullable<typeof options.outside>[number]) => (part.after != null ? `after ${keepRangeTogether(part.after)}` : `from ${keepRangeTogether(part.range ?? '')}`);
  const of = (service: 'none' | 'less' | 'unknown') => options.outside!.filter(part => part.service === service).map(where).join(' or ');
  const clauses = [
    of('none') && `with no service ${of('none')}`,
    of('less') && `less often ${of('less')}`,
    of('unknown') && `not ${of('unknown')}`,
  ].filter(Boolean) as string[];
  return `${lead}${clauses.map((clause, i) => (i === 0 && clause.startsWith('with') ? `, ${clause}` : `, and ${clause}`)).join('')}.`;
}

// N8 no-trips-in-period, N11 not-in-period, N17 and N26 (CIV-1077: one sentence): "This route has no scheduled trips from 6–9 AM."
const noTripsText = (subject: 'route' | 'agency', when: string) => `This ${subject} has no scheduled trips ${when}.`;
const routeNoTripsText = (when: string) => noTripsText('route', when);

// N8 no-trips-in-period, N9 limited-in-period
export function periodServiceNotice(periodRange: string, partial: boolean, activeRange?: string): string {
  return partial
    ? `This route runs only from ${keepRangeTogether(activeRange || periodRange)} in this period. No frequency is shown.`
    : routeNoTripsText(`from ${keepRangeTogether(periodRange)}`);
}

// N10 uneven-gaps
export function unevenServiceNotice(longestGap: number): string {
  return `This route runs all period, but the gaps between trips vary, up to ${delayAmount(longestGap)}.`;
}

// N7 no-route-line
export const NO_ROUTE_SHAPE_NOTICE = "This route's line can't be shown on the map because it's missing from the agency's data.";

// N16 booked-ahead
/** CIV-1006: a route riders must book ahead (Ryan's wording). */
export const BOOKING_REQUIRED_NOTICE = 'Rides on this route must be booked ahead.';


// N11 not-in-period, N12 misses-filter
/** Notices name the chosen time of day, never "the selected period" (Ryan); `periodRange` is "6–9 AM", or null for all day. */
export function selectedRouteOutsideFilterNotice(maxHeadway: number, periodRange: string | null): string {
  const when = periodRange ? keepRangeTogether(periodRange) : null;
  return maxHeadway === Infinity
    ? routeNoTripsText(when ? `from ${when}` : 'all day')
    // Non-breaking hyphen (U+2011) keeps "15-minute" on one line instead of wrapping after "15-".
    : `This route doesn't meet the ${maxHeadway}\u2011minute filter ${when ? `for all of ${when}` : 'all day'}.`;
}

// N123 part-of-route-meets-filter (Ryan's exact wording, CIV-514): the selected route misses the filter, but part of it
// qualifies, as the shared-stretch overlay draws (failingRouteSharedRanges). Ryan approved "the selected period" here,
// an exception to the time-of-day rule above. A no-break space keeps "15 minutes" on one line, as the hyphen does above.
export function selectedRoutePartMeetsFilterNotice(maxHeadway: number): string {
  return `Only part of this route runs every ${maxHeadway}\u00A0minutes or better during the selected period.`;
}

// E1 outdated-schedule, paragraph 1 end (N2 and N3 versions); the rest of E1 is pieces (EXPLAINER_PIECES).
export const EXPIRED_FEED_EXPLANATION =
  'This is the latest schedule the agency has published that we could verify.';

// N77 check-history, N78 last-refreshed / E1 line 2
export function expiredFeedCheckHistory(options: {
  count?: number;
  since?: string;
  lastChecked?: string;
  lastRefreshed?: string;
}): string {
  if (options.count != null && options.since && options.lastChecked && formatStoredDate(options.lastChecked)) {
    return `We've checked for a new schedule ${options.count} ${plural(options.count, 'time')} since ${formatStoredDate(options.since)}, with our most recent check on ${formatStoredDate(options.lastChecked)}.`;
  }
  if (options.lastRefreshed && formatStoredDate(options.lastRefreshed)) {
    return `The feed was last refreshed on ${formatStoredDate(options.lastRefreshed)}.`;
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
export const loadErrorText = (subject: string) => `${subject.charAt(0).toUpperCase()}${subject.slice(1)} couldn't load.`;

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
export const NO_ROUTES_NEARBY = 'No routes within 500 m';
// N44 no-suggestions
export const NO_ROUTE_SUGGESTIONS = 'No route suggestions in this area.';
// N43 no-agencies-in-view
export const NO_AGENCIES_IN_VIEW = 'No agencies in view.';
// N115, N116 settings-list-no-search-matches (CIV-957): "No hidden routes match your search."
export const noSearchMatchText = (things: string) => `No ${things} match your search.`;
// N52 night-no-agencies (CIV-1077: "your search", as N115)
export const NO_AGENCIES_MATCH_SEARCH = noSearchMatchText('agencies');
// N113 settings-no-limited-routes
export const NO_LIMITED_ROUTES_IN_VIEW = 'No limited-service routes in view.';
// N114 settings-hidden-routes-unavailable
export const HIDDEN_ROUTES_UNAVAILABLE = 'The hidden-route list is unavailable right now.';
// N117 settings-no-degraded-feeds
export const NO_DEGRADED_FEEDS = 'No degraded or unusable feeds are currently recorded.';
// N119 story-map-loading: loadingText with the agency's network, "Loading MiWay’s network…".
export const storyMapLoadingText = (agencyName: string) => loadingText(`${agencyName}’s network`);
// N120 story-map-failed
export const storyMapFailedText = (agencyName: string) => `The ${agencyName} network preview is unavailable.`;
// N118 settings-no-feed-matches
export const NO_FEED_MATCHES = 'No feeds match your search or filter.';

// ---- Route labels and setting definitions (CIV-957 item 2): each written once, used by every card, list and setting ----
// D1 route-limited: a row with no steady frequency in the period ("limited" in place of a number).
export const LIMITED_SERVICE_LABEL = 'limited';
// D2 no-regular-service: the filter says the route has no regular service in the period.
export const NO_REGULAR_SERVICE_LABEL = 'no regular service during this period';
// D3 no-regular-service-short: the same, for the narrow Nearby and search rows.
export const NO_REGULAR_SERVICE_SHORT_LABEL = 'no regular service';
// D4 setting-hide-one-off
export const HIDE_ONE_OFF_SETTING = { label: 'Hide one-off routes', description: 'School runs, a few trips a day, on-demand.' } as const;
// D5 setting-hide-part-time
export const HIDE_PART_TIME_SETTING = { label: 'Hide part-time routes', description: 'Only at rush hour, evenings, or some days.' } as const;
// D6 setting-hide-degraded-feeds
export const HIDE_DEGRADED_FEEDS_SETTING = { label: 'Hide degraded feeds', description: 'Hides agencies with known data-quality problems. Feeds still being reviewed remain visible.' } as const;

// ---- Map keys (CIV-957) ----
// K1 frequency-key heading
export const MAP_KEY_FREQUENCY = 'Frequency';
// K2 frequency-key selected
export const MAP_KEY_SELECTED = 'Selected / qualifying';
// K3 frequency-key other
export const MAP_KEY_OTHER = 'Other routes';
// K4 night-key (also the exported image's key)
export const MAP_KEY_NIGHT = 'Overnight service';

// ---- Route card ----
// N1 weekday-variation
export const WEEKDAY_VARIATION_NOTICE = "This route's weekday schedules vary by day.";
// N15 variants
/** "Includes variants 51A, 51B" (beta route variants). */
export const variantsIncludedNotice = (shortNames: string) => `Includes variants ${shortNames}`;
// N14 first-last-allowance
/** The info icon's hover text on a row whose frequency allows a longer first or last trip. */
export const FIRST_LAST_TRIP_ALLOWANCE_HINT = "This route's frequency allows a slightly longer wait for the first or last trip of the day.";

// ---- Route and agency cards ----
// N6 route-shape-problem
/** A route whose line had a confirmed shape problem in the source feed (shared/routeDataQuality.ts has the code). */
export const ROUTE_DATA_QUALITY_WARNING_MESSAGE =
  "This route's line on the map may be incomplete because of an error in the agency's data.";
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
export const NEW_SCHEDULE_DATA_NOTICE = { route: "This route's new schedule is still being verified.", agency: "This agency's new schedule is still being verified." } as const;
// N5 corrected (route), N22 corrected (agency)
export const CORRECTED_DATA_NOTICE = { route: "We corrected an error in this route's schedule.", agency: "We corrected an error in this agency's schedule." } as const;
// N23 routes-outside-show
export const routesOutsideFiltersNotice = (count: number) => `${count} ${plural(count, 'route')} outside your filters.`;
// N24 routes-outside-hide
export const ROUTES_OUTSIDE_FILTERS_NOTICE = 'These routes are outside your filters.';
// N31 on-demand-not-mapped
/** An on-demand agency whose zone isn't drawn (the card's on-demand pill). */
export const ON_DEMAND_NOT_MAPPED_NOTE = "This agency's on-demand service runs by request in a zone that isn't on the map yet.";
// N32 zone-part-not-mapped
/** "This service's north zone isn't on the map yet." */
export const notOnMapYetNotice = (missing: string) => `This service's ${missing.replace(/^the /, '')} isn't on the map yet.`;
// N70 report-form-hint
export const REPORT_FORM_HINT = 'Choose a category, or click a card value to preselect its reason.';
// N69 report-needs-detail
export const REPORT_NEEDS_FREQUENCY_DETAIL = 'Select at least one frequency detail.';
// N69 report-needs-reason
export const REPORT_NEEDS_REASON = 'Select a reason or describe what is wrong.';

// ---- History ----
// N53 history-trip-time
export const HISTORY_TRIP_TIME_NOTE = "This is the scheduled time for one typical weekday trip end to end, shown only when the route's stops and path stayed the same across these years.";
// N56 history-order
export const HISTORY_ROUTE_ORDER_NOTE = 'Biggest changes first';

// ---- Map ----
// N46 networks-failed
export const networksFailedText = (count: number) => (count === 1 ? "1 agency couldn't load" : `${count} agencies couldn't load`);
// N46 networks-failed (hover)
/** The agencies' names: "TTC and YRT couldn't load." */
export const networksFailedHint = (names: readonly string[]) => `${joinList(names)} couldn't load.`;
// N45 networks-loading
export const networksLoadingText = (loaded: number, requested: number) => `Loading ${loaded} of ${requested} agencies…`;
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
export const CLIPBOARD_DENIED = "The link couldn't be copied. Clipboard access was denied.";
// N48 location-denied
export const LOCATION_DENIED = "Location access was denied. Check your browser's site permissions.";
// N49 approximate-location
export const approximateLocationHint = (city?: string | null) => (city
  ? `The map shows the approximate area of ${city}. Your precise location wasn't available.`
  : "The map shows an approximate location. Your precise location wasn't available.");
// N50 location-timeout
export const LOCATION_TIMED_OUT = 'Finding your location took too long. Try again.';
// N50 location-unavailable
export const LOCATION_UNAVAILABLE = "Your location couldn't be found. Check your device's location services.";

// ---- Map image export ----
/** N57 and N58 open with the same sentence (CIV-1077). */
const MAP_STILL_LOADING = 'The map is still loading.';
// N58 export-timeout, N59 export-no-routes, N60 export-failed-networks
/** Why an image can't be saved yet, by reason (utils/mapExport.ts). */
export const MAP_EXPORT_BLOCKED_MESSAGES = {
  timeout: `${MAP_STILL_LOADING} Try again in a moment to get every route in the image.`,
  // Only when the view has no route data; routes hidden by filters still save.
  'no-routes': "There's no transit data in this view to save. Move the map to an area with service and try again.",
  'failed-networks': "Some agencies' routes didn't load. Reload the page and try again to get every route in the image.",
} as const;
// N61 export-not-ready
export const MAP_EXPORT_NOT_READY = "The map wasn't ready. Try again in a moment.";
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
export const VIEW_ERROR_TEXT = "This view couldn't load because of an error.";
// N68 map-error
export const MAP_ERROR_TEXT = "The map couldn't be shown because of an error.";
// N71 not-found
export const NOT_FOUND_TITLE = 'This page took the wrong route';
// N71 not-found
export const NOT_FOUND_BODY = "We couldn't find that page.";
// N72 page-not-found
export const AGENCY_PAGE_NOT_FOUND_TITLE = 'No page for this agency';
// N72 page-not-found
export const AREA_PAGE_NOT_FOUND_TITLE = 'No page for this region';
// N72 page-not-found
export const NO_FREQUENCY_PAGE_BODY = 'This address has no frequency page.';

const DAYS_PLURAL: Record<string, string> = { Weekday: 'weekdays', Saturday: 'Saturdays', Sunday: 'Sundays' };
// N17 route-no-service-day, N26 agency-no-service-day (Ryan; "trips", as N8, CIV-1077)
export const noServiceOnDayNotice = (subject: 'route' | 'agency', day: string) => noTripsText(subject, `on ${DAYS_PLURAL[day] ?? day}`);
// N35 stop-no-routes-in-period (Ryan)
export const stopNoRoutesNotice = (periodRange: string) => `No routes stop here from ${keepRangeTogether(periodRange)}.`;
// N36 stop-not-found (Ryan)
export const STOP_NOT_FOUND = "This stop couldn't be found. It may have been moved or removed.";
// N51 night-failed (Ryan)
export const NIGHT_LOAD_FAILED = loadErrorText('overnight service');
/** N52 night-empty (Ryan): the Night view's own rule, fixed at 2-5 AM (FREQUENCY_RULES rule 10), at its 30 or 60. A real search with no match keeps N52's old text. */
export const nightNoRoutesNotice = (frequency: number) => `No routes here run every ${frequency} min or better from 2–5 AM.`;
// N54 history-failed (Ryan; with RETRY_HINT in the sidebar)
export const HISTORY_LOAD_FAILED = loadErrorText('history');
// N55 history-route-not-covered (Ryan)
export const HISTORY_ROUTE_NOT_COVERED = 'This route has no past schedules in History yet.';
// N18 route-not-found (Ryan)
export const ROUTE_NOT_FOUND = "This route couldn't be found. It may have been renumbered or removed.";
// N27 agency-routes-failed (Ryan)
export const AGENCY_ROUTES_FAILED = `${loadErrorText("this agency's routes")} ${RETRY_HINT}`;
// N30 agency-not-found (Ryan)
export const AGENCY_NOT_FOUND = "This agency couldn't be found.";
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
  'edge-gap-allowance': { code: 'E7', title: 'Frequency allowance' },
  'weekday-variation': { code: 'E8', title: 'Weekday variation' },
} as const;
export type HelpTopic = keyof typeof EXPLAINERS;

// ---- Explainer paragraph 1, one per explainer (Ryan's approved text, CIV-1051) ----
// Paragraphs 2 and 3 are shared pieces, below. E1's lead is the notice plus EXPIRED_FEED_EXPLANATION;
// E3's is the agency's correction note; E6's is N7 itself.
// E1, N25 version (CIV-1051): "ends" before the listing-end date, "ended" from it on. Paragraphs 2 and 3 are N2's.
export function listingEndedPanelLead(agencyName: string, date: string, ended: boolean): string {
  const { primary } = agencyNames(agencyName).card;
  return `${primary}'s scheduled service for most routes ${ended ? 'ended' : 'ends'} ${date}, and they have not released updated data. The map shows the last full week in their schedule, for every route.`;
}
// E2: the date is the day the schedule went on the map.
export const newScheduleDataLead = (agencyName: string, onMapOn?: string | null) =>
  `${agencyNames(agencyName).card.primary}'s new schedule went on the map${onMapOn ? ` on ${onMapOn}` : ''}. It may have errors we haven't found yet.`;
// E4
export const betaRolloutLead = (agencyName: string) => onlyOnBetaText(agencyNames(agencyName).card.primary);
// E5
export const ROUTE_DATA_QUALITY_LEAD = "Part of this route's line on the map may be missing or drawn in the wrong place.";
// E7: N14 itself, then the allowance (CIV-1077); 10 minutes is EDGE_GAP_ALLOWANCE_MINUTES (pipeline/transit-phase2.ts).
export const EDGE_GAP_ALLOWANCE_LEAD = `${FIRST_LAST_TRIP_ALLOWANCE_HINT} That trip can come up to 10 minutes later than usual.`;
// E8: N1 itself, then one more sentence.
export const WEEKDAY_VARIATION_LEAD = `${WEEKDAY_VARIATION_NOTICE} Some weekdays run more or less often than others.`;

// ---- Explainer pieces (CIV-1061): every paragraph 2 and 3 sentence, written once ----
/** Where a paragraph-3 piece's links go, in order. */
export type ExplainerLink = 'agency-website' | 'report-schedule' | 'technical-details' | 'report-data';
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
  MANUAL_FEED: { code: 'X2', text: "This agency doesn't publish a feed we can check automatically. We update it when a newer file is provided and verified." },
  VERIFYING_NEW_SCHEDULE: { code: 'X3', text: "We're verifying it for missing service and other errors, and we'll correct anything we find." },
  CORRECTED_BEFORE_MAP: { code: 'X4', text: "We correct errors like this before a schedule goes on the map." },
  VERIFYING_BETA: { code: 'X5', text: "We're still verifying its schedule, and some routes or times may change." },
  FREQUENCY_FROM_TIMETABLE_LINE_WRONG: { code: 'X6', text: "We still show the route. Its frequency on this card comes from the schedule and is still accurate." },
  FREQUENCY_FROM_TIMETABLE_NO_LINE: { code: 'X7', text: "We still show the route on this card. Its frequency comes from the schedule and is still accurate." },
  MIDDAY_GAPS: { code: 'X8', text: "Many routes start or end their day with one longer gap. Gaps in the middle of the day don't get this allowance." },
  WEEKDAYS_SEPARATE: { code: 'X9', text: "We check each weekday separately, which means one busier day can't make the route look more frequent than it usually is." },
  // Paragraph 3: what the reader can do.
  AGENCY_WEBSITE_NEWER: { code: 'X10', text: "A newer schedule may be on the agency's website.", links: ['agency-website', 'report-schedule'] },
  AGENCY_WEBSITE_CURRENT: { code: 'X11', text: "The agency's website has its current schedule.", links: ['agency-website'], needsWebsite: true },
  AGENCY_WEBSITE_EACH_DAY: { code: 'X12', text: "The agency's website has each day's schedule.", links: ['agency-website'], needsWebsite: true },
  REPORT_BELOW: { code: 'X13', text: "If something still looks wrong, report it below.", links: ['technical-details', 'report-data'] },
  REPORT_WITH_FLAG: { code: 'X14', text: "If something looks wrong, report it with the flag on this card." },
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
  /** An agency's own rollout note from its config (none set today); the beta-only notices link to beta instead. */
  N19: 'beta-rollout',
  N21: 'new-schedule-data',
  N22: 'corrected-data',
  N25: 'outdated-schedule',
} as const satisfies Record<string, HelpTopic>;
export type LearnMoreCode = keyof typeof NOTICE_EXPLAINERS;
export const explainerFor = (code: LearnMoreCode): HelpTopic => NOTICE_EXPLAINERS[code];
