/**
 * Every notice, empty-state, error and callout text the site shows, in one place (CIV-1045, Ryan: "one single page where
 * the entire site pulls from"). Components only call these; a guard test (noticeCopy.test.ts) fails on new inline text.
 * Live's texts stay with Live for now (Atlas Live's lane).
 *
 * Codes (CIV-1045): each notice has a permanent N-code and each Learn-more explainer an E-code, the same as on the
 * review page (_review/notices). A new text takes the next free number; numbers are never reused. Every notice with
 * Learn more names its explainer in NOTICE_EXPLAINERS, so the two can be checked against each other.
 */
import { plural } from '../../shared/overflowText';
import { formatStoredDate } from '../utils/format';
import { agencyNames } from '../utils/agencyName';
import { delayAmount, headwayAbout } from '../utils/headwayText';

// N2 timetable-ended, N3 manual-timetable-ended
/** Shared user-facing copy for every expired-feed notice. */
export function expiredFeedNotice(agencyName: string, expDateStr?: string, manualFeedSource = false): string {
  const { primary } = agencyNames(agencyName).card;
  const ended = `${primary}'s timetable ended${expDateStr ? ` on ${expDateStr}` : ''}.`;
  if (manualFeedSource) {
    return `${ended} It is maintained manually, so Atlas will keep showing it until a newer file is provided and verified.`;
  }
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
}): string {
  const runs = options.headway != null ? `Service runs ${headwayAbout(options.headway)}` : 'Service runs';
  return `${runs} from ${keepRangeTogether(options.activeRange)}, but not throughout the selected ${keepRangeTogether(options.periodRange)} period.`;
}

// N8 no-trips-in-period, N9 limited-in-period
export function periodServiceNotice(periodRange: string, partial: boolean, activeRange?: string): string {
  return partial
    ? `This route runs only from ${keepRangeTogether(activeRange || periodRange)} in this period. No frequency is shown.`
    : `This route has no scheduled trips from ${keepRangeTogether(periodRange)}.`;
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

// E6 no-route-shape (line 1)
export const NO_ROUTE_SHAPE_EXPLANATION =
  'This route\'s source feed includes schedule information but does not include a usable map shape.';

// E6 no-route-shape (line 2)
export const NO_ROUTE_SHAPE_DETAIL =
  'Atlas can still show the route\'s schedule, stops, and frequency, but it cannot draw the route line.';

// N11 not-in-period, N12 misses-filter
export function selectedRouteOutsideFilterNotice(maxHeadway: number): string {
  return maxHeadway === Infinity
    ? "This route doesn't run during the selected period."
    // Non-breaking hyphen (U+2011) keeps "15-minute" on one line instead of wrapping after "15-".
    : `This route does not meet the selected ${maxHeadway}\u2011minute filter for the full selected period.`;
}

// N74 / E1 outdated-schedule (line 3)
export const EXPIRED_FEED_EXPLANATION =
  'Atlas keeps showing the most recent feed it could verify while we look for a newer public feed.';

// N75 / E1 outdated-schedule (line 4)
export const EXPIRED_FEED_CONTEXT =
  'A newer schedule may exist on the agency\'s website without a downloadable feed Atlas can verify.';

// N76 / E1 outdated-schedule (line 4, kept by hand)
export const MANUAL_FEED_CONTEXT =
  'This agency does not publish a feed that Atlas can check automatically. We update it when a newer file is provided and verified.';

// E1 outdated-schedule (line 4 start)
export const EXPIRED_FEED_CADENCE = 'We check all feeds weekly.';

// N77 check-history, N78 last-refreshed / E1 line 2
export function expiredFeedCheckHistory(options: {
  count?: number;
  since?: string;
  lastChecked?: string;
  lastRefreshed?: string;
}): string {
  if (options.count != null && options.since && options.lastChecked && formatStoredDate(options.lastChecked)) {
    return `Atlas has checked for a new timetable ${options.count} ${plural(options.count, 'time')} since ${formatStoredDate(options.since)}, most recently on ${formatStoredDate(options.lastChecked)}.`;
  }
  if (options.lastRefreshed && formatStoredDate(options.lastRefreshed)) {
    return `Atlas last successfully refreshed the feed on ${formatStoredDate(options.lastRefreshed)}.`;
  }
  return '';
}

// ---- Loading, errors and empty lists ----
// N65 loading, N67 loading-selection
/** Wording for loading and error states in panels and badges, so every screen says it the same way. */
/** "Loading night service…": the noun after the verb, then an ellipsis character (not three dots). */
export const loadingText = (noun: string) => `Loading ${noun}…`;

// N51 night-failed, N54 history-failed, N66 agencies-failed, N67 selection-failed
/** "Couldn't load history data." */
export const loadErrorText = (noun: string) => `Couldn't load ${noun}.`;

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
// N41 in-view-no-agencies
export const NO_MATCHING_AGENCIES = 'No matching agencies.';
// N42 in-view-no-routes
export const NO_MATCHING_ROUTES = 'No matching routes.';
// N37 no-routes-nearby
export const NO_ROUTES_NEARBY = 'No routes within 500 m';
// N44 no-suggestions
export const NO_ROUTE_SUGGESTIONS = 'No route suggestions in this area.';
// N43 no-agencies-in-view
export const NO_AGENCIES_IN_VIEW = 'No agencies in view.';
// N52 night-no-agencies
export const NO_AGENCIES_MATCH_SEARCH = 'No agencies match that search.';

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
// N108 beta-agency (replaces N19's wording; Ryan)
export const BETA_ROLLOUT_NOTICE = 'This agency is only available on Atlas beta.';
// N20 beta-on-demand
/** The same for an on-demand service on the beta site; Ryan's approval named the agency notice only, so this one is unchanged. */
export const BETA_SERVICE_ROLLOUT_NOTICE = 'On-demand service is only available on Atlas beta.';
/** N20 and N108's link (Ryan): the same page on the beta site; never preview, and not shown on beta itself. */
export const VIEW_ON_BETA = 'View';
/** The agency's rollout notice: its own (an on-demand service's), else the beta-only agency one. */
export function getRolloutNotice(agency: { betaOnly?: boolean; rolloutNotice?: string }): string | undefined {
  return agency.betaOnly ? (agency.rolloutNotice ?? BETA_ROLLOUT_NOTICE) : agency.rolloutNotice;
}
// N4 new-schedule (route), N21 new-schedule (agency)
/** The route card and the agency card word these for what they show (CIV-941). */
export const NEW_SCHEDULE_DATA_NOTICE = { route: "This route's new schedule is still being checked for errors.", agency: "This agency's new schedule data is being verified." } as const;
// N5 corrected (route), N22 corrected (agency)
export const CORRECTED_DATA_NOTICE = { route: "We corrected an error in this route's schedule.", agency: 'We corrected this data.' } as const;
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
export const networksFailedText = (count: number) => (count === 1 ? '1 network failed to load' : `${count} networks failed to load`);
// N46 networks-failed (hover)
export const networksFailedHint = (slugs: readonly string[]) => `Couldn't load: ${slugs.join(', ')}`;
// N45 networks-loading
export const networksLoadingText = (loaded: number, requested: number) => `${loaded}/${requested} networks`;
// N34 on-demand-failed
export const ON_DEMAND_AREAS_FAILED = "On-demand areas couldn't load.";
// N33 on-demand-growing
export const ON_DEMAND_COVERAGE_GROWING = 'On-demand coverage is still growing. Not every service is mapped yet.';
// N47 link-copied
export const LOCATION_URL_COPIED = 'Location URL copied';
// N47 copy-denied
export const CLIPBOARD_DENIED = 'Could not copy — clipboard access denied';
// N48 location-denied
export const LOCATION_DENIED = "Location access denied — check your browser's site permissions";
// N49 approximate-location
export const approximateLocationHint = (city?: string | null) => (city
  ? `Showing the approximate area of ${city} — precise location wasn't available`
  : "Showing an approximate location — precise location wasn't available");
// N50 location-timeout
export const LOCATION_TIMED_OUT = 'Location request timed out — try again';
// N50 location-unavailable
export const LOCATION_UNAVAILABLE = "Couldn't determine your location — check your device's location services";

// ---- Map image export ----
// N58 export-timeout, N59 export-no-routes, N60 export-failed-networks
/** Why an image can't be saved yet, by reason (utils/mapExport.ts). */
export const MAP_EXPORT_BLOCKED_MESSAGES = {
  timeout: 'The map is still loading, so the image would be missing routes. Try again in a moment.',
  'no-routes': 'No routes are showing in this view yet. Move the map to an area with service and try again.',
  'failed-networks': 'Some transit networks did not load, so the image would be missing routes. Reload the page and try again.',
} as const;
// N61 export-not-ready
export const MAP_EXPORT_NOT_READY = 'The map was not ready. Try again in a moment.';
// N57 export-waiting
export const MAP_EXPORT_WAITING = 'Map still loading. The image will save once every route is drawn.';

// ---- Site ----
// N62 update-available
export const UPDATE_AVAILABLE_NOTICE = 'A newer version of this page is available.';
// N63 analytics-prompt
export const ANALYTICS_CONSENT_PROMPT = 'Optional analytics help improve Atlas.';
// N64 analytics-setting
export const ANALYTICS_SETTING_NOTE = 'Optional analytics helps us understand which parts of Atlas people use.';
// N68 view-error
export const VIEW_ERROR_TEXT = 'Something went wrong loading this view.';
// N68 map-error
export const MAP_ERROR_TEXT = 'The map encountered an error.';
// N71 not-found
export const NOT_FOUND_TITLE = 'This page took the wrong route';
// N71 not-found
export const NOT_FOUND_BODY = "We couldn't find that page.";
// N72 page-not-found
export const AGENCY_PAGE_NOT_FOUND_TITLE = 'No page for this agency';
// N72 page-not-found
export const AREA_PAGE_NOT_FOUND_TITLE = 'No page for this region';
// N72 page-not-found
export const NO_FREQUENCY_PAGE_BODY = 'Atlas has no frequency page at this address.';

// N25 listing-ended (Ryan's exact text, CIV-1011; not shown anywhere yet)
export const listingEndedNotice = (date: string) => `This agency's scheduled service for most routes ended ${date}, and they have not released updated data.`;

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

// E2 new-schedule-data
export const newScheduleDataLead = (agencyName: string, publishedOn?: string | null) =>
  `${agencyName} recently published new schedule data.${publishedOn ? ` Atlas published it on ${publishedOn}.` : ''}`;
export const NEW_SCHEDULE_DATA_EXPLANATION =
  "Atlas publishes new feeds automatically so the map stays current. We're checking this feed for missing service and data-quality problems before treating it as verified.";
export const NEW_SCHEDULE_DATA_TEMPORARY =
  'This notice is temporary. It will disappear after review, or become a correction notice if we find a known problem.';
// E3 corrected-data
export const CORRECTED_DATA_EXPLANATION =
  'Sometimes agencies publish incorrect data in their GTFS feed. When we find a known problem, we filter it out during processing so the map reflects real service.';
// E4 beta-rollout
export const betaRolloutLead = (agencyName: string) => `${agencyName} is currently available in Atlas beta while its schedule data is being validated.`;
export const BETA_ROLLOUT_EXPLANATION =
  'This coverage is still being checked before it is added to the main Atlas map. Some routes or schedule details may change during testing.';
// E5 route-data-quality
export const routeDataQualityLead = (agencyName: string) => `${agencyName} has a problem with this route's shape in the source feed.`;
export const ROUTE_DATA_QUALITY_EXPLANATION =
  "Transit agencies publish the route shapes Atlas uses to draw routes. Atlas identified a specific problem in this route's source geometry, so the route stays visible with a warning instead of hiding the entire agency.";
export const ROUTE_DATA_QUALITY_DETAIL = 'The line may be incomplete or adjusted. The schedule information is separate from the map geometry.';
// E7 edge-gap-allowance
// Ryan's approved wording (CIV-1045), replacing both old lines.
export const EDGE_GAP_ALLOWANCE_LEAD = 'A route can still count at its frequency when the first or last trip of the day comes a little later than the rest.';
export const EDGE_GAP_ALLOWANCE_EXPLANATION = "Gaps in the middle of the day don't get this allowance.";
// E8 weekday-variation
export const WEEKDAY_VARIATION_LEAD = 'Weekday schedules differ for this route.';
export const WEEKDAY_VARIATION_EXPLANATION =
  'Atlas checks Monday through Friday separately. The frequency tier shown on the route card reflects the slowest actual weekday, while the displayed cadence uses a typical actual weekday. This keeps the summary from combining departures that ran on different days.';

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
