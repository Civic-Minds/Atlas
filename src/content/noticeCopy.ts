/**
 * Every notice, empty-state, error and callout text the site shows, in one place (CIV-1045, Ryan: "one single page where
 * the entire site pulls from"). Components only call these; a guard test (noticeCopy.test.ts) fails on new inline text.
 * Live's texts stay with Live for now (Atlas Live's lane).
 */
import { plural } from '../../shared/overflowText';
import { formatStoredDate } from '../utils/format';
import { agencyNames } from '../utils/agencyName';
import { delayAmount, headwayAbout } from '../utils/headwayText';

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

export function selectedRouteFilterNotice(options: {
  /** The route's own filter value for the period; without one the notice names no frequency. */
  headway?: number | null;
  activeRange: string;
  periodRange: string;
}): string {
  const runs = options.headway != null ? `Service runs ${headwayAbout(options.headway)}` : 'Service runs';
  return `${runs} from ${keepRangeTogether(options.activeRange)}, but not throughout the selected ${keepRangeTogether(options.periodRange)} period.`;
}

export function periodServiceNotice(periodRange: string, partial: boolean, activeRange?: string): string {
  return partial
    ? `This route runs only from ${keepRangeTogether(activeRange || periodRange)} in this period. No frequency is shown.`
    : `This route has no scheduled trips from ${keepRangeTogether(periodRange)}.`;
}

export function unevenServiceNotice(longestGap: number): string {
  return `This route runs all period, but the gaps between trips vary, up to ${delayAmount(longestGap)}.`;
}

export const NO_ROUTE_SHAPE_NOTICE = "This route's line can't be shown on the map because it's missing from the agency's data.";

/** CIV-1006: a route riders must book ahead (Ryan's wording). */
export const BOOKING_REQUIRED_NOTICE = 'Rides on this route must be booked ahead.';

export const NO_ROUTE_SHAPE_EXPLANATION =
  'This route\'s source feed includes schedule information but does not include a usable map shape.';

export const NO_ROUTE_SHAPE_DETAIL =
  'Atlas can still show the route\'s schedule, stops, and frequency, but it cannot draw the route line.';

export function selectedRouteOutsideFilterNotice(maxHeadway: number): string {
  return maxHeadway === Infinity
    ? "This route doesn't run during the selected period."
    // Non-breaking hyphen (U+2011) keeps "15-minute" on one line instead of wrapping after "15-".
    : `This route does not meet the selected ${maxHeadway}\u2011minute filter for the full selected period.`;
}

export const EXPIRED_FEED_EXPLANATION =
  'Atlas keeps showing the most recent feed it could verify while we look for a newer public feed.';

export const EXPIRED_FEED_CONTEXT =
  'A newer schedule may exist on the agency\'s website without a downloadable feed Atlas can verify.';

export const MANUAL_FEED_CONTEXT =
  'This agency does not publish a feed that Atlas can check automatically. We update it when a newer file is provided and verified.';

export const EXPIRED_FEED_CADENCE = 'We check all feeds weekly.';

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
/** Wording for loading and error states in panels and badges, so every screen says it the same way. */
/** "Loading night service…": the noun after the verb, then an ellipsis character (not three dots). */
export const loadingText = (noun: string) => `Loading ${noun}…`;

/** "Couldn't load history data." */
export const loadErrorText = (noun: string) => `Couldn't load ${noun}.`;

/** Added after a load error that the person can retry. */
export const RETRY_HINT = 'Check your connection and try again.';

/** A route list with nothing to show: the agency card's wording, shared with History's agency view. */
export const NO_ROUTES_LOADED = 'No routes loaded yet.';
/** A route list whose mode pill (or search) leaves nothing: "No streetcar routes match.", or "No routes match." with no pill. */
export const noRoutesMatchText = (modeLabel?: string | null) => `No ${modeLabel ? `${modeLabel.toLowerCase()} ` : ''}routes match.`;
export const NO_SEARCH_MATCHES = 'No matches found.';
export const NO_AGENCIES_MATCH = 'No agencies match.';
export const NO_MATCHING_AGENCIES = 'No matching agencies.';
export const NO_MATCHING_ROUTES = 'No matching routes.';
export const NO_ROUTES_NEARBY = 'No routes within 500 m';
export const NO_ROUTE_SUGGESTIONS = 'No route suggestions in this area.';
export const NO_AGENCIES_IN_VIEW = 'No agencies in view.';
export const NO_AGENCIES_MATCH_SEARCH = 'No agencies match that search.';

// ---- Route card ----
export const WEEKDAY_VARIATION_NOTICE = "This route's weekday schedules vary. The least frequent day is shown.";
/** "Includes variants 51A, 51B" (beta route variants). */
export const variantsIncludedNotice = (shortNames: string) => `Includes variants ${shortNames}`;
/** The info icon's hover text on a row whose frequency allows a longer first or last trip. */
export const FIRST_LAST_TRIP_ALLOWANCE_HINT = "This route's frequency allows a slightly longer wait for the first or last trip of the day.";

// ---- Route and agency cards ----
/** A route whose line had a confirmed shape problem in the source feed (shared/routeDataQuality.ts has the code). */
export const ROUTE_DATA_QUALITY_WARNING_MESSAGE =
  "This route's line on the map may be incomplete because of an error in the agency's data.";
export const BETA_ROLLOUT_NOTICE = 'This agency is only available in Atlas preview and beta, not the public version.';
/** The same for an on-demand service on the beta site; Ryan's approval named the agency notice only, so this one is unchanged. */
export const BETA_SERVICE_ROLLOUT_NOTICE =
  'This service is currently available only in Atlas preview and beta. It is not included in the public version.';
/** The agency's rollout notice: the beta-only one, else the agency's own note from its config. */
export function getRolloutNotice(agency: { betaOnly?: boolean; rolloutNotice?: string }): string | undefined {
  return agency.betaOnly ? BETA_ROLLOUT_NOTICE : agency.rolloutNotice;
}
/** The route card and the agency card word these for what they show (CIV-941). */
export const NEW_SCHEDULE_DATA_NOTICE = { route: "This route's new schedule is still being checked for errors.", agency: "This agency's new schedule data is being verified." } as const;
export const CORRECTED_DATA_NOTICE = { route: "We corrected an error in this route's schedule.", agency: 'We corrected this data.' } as const;
export const routesOutsideFiltersNotice = (count: number) => `${count} ${plural(count, 'route')} outside your filters.`;
export const ROUTES_OUTSIDE_FILTERS_NOTICE = 'These routes are outside your filters.';
/** An on-demand agency whose zone isn't drawn (the card's on-demand pill). */
export const ON_DEMAND_NOT_MAPPED_NOTE = "This agency's on-demand service runs by request in a zone that isn't on the map yet.";
/** "This service's north zone isn't on the map yet." */
export const notOnMapYetNotice = (missing: string) => `This service's ${missing.replace(/^the /, '')} isn't on the map yet.`;
export const REPORT_FORM_HINT = 'Choose a category, or click a card value to preselect its reason.';
export const REPORT_NEEDS_FREQUENCY_DETAIL = 'Select at least one frequency detail.';
export const REPORT_NEEDS_REASON = 'Select a reason or describe what is wrong.';

// ---- History ----
export const HISTORY_TRIP_TIME_NOTE = "This is the scheduled time for one typical weekday trip end to end, shown only when the route's stops and path stayed the same across these years.";
export const HISTORY_ROUTE_ORDER_NOTE = 'Biggest changes first';

// ---- Map ----
export const networksFailedText = (count: number) => (count === 1 ? '1 network failed to load' : `${count} networks failed to load`);
export const networksFailedHint = (slugs: readonly string[]) => `Couldn't load: ${slugs.join(', ')}`;
export const networksLoadingText = (loaded: number, requested: number) => `${loaded}/${requested} networks`;
export const ON_DEMAND_AREAS_FAILED = "On-demand areas couldn't load.";
export const ON_DEMAND_COVERAGE_GROWING = 'On-demand coverage is still growing. Not every service is mapped yet.';
export const LOCATION_URL_COPIED = 'Location URL copied';
export const CLIPBOARD_DENIED = 'Could not copy — clipboard access denied';
export const LOCATION_DENIED = "Location access denied — check your browser's site permissions";
export const approximateLocationHint = (city?: string | null) => (city
  ? `Showing the approximate area of ${city} — precise location wasn't available`
  : "Showing an approximate location — precise location wasn't available");
export const LOCATION_TIMED_OUT = 'Location request timed out — try again';
export const LOCATION_UNAVAILABLE = "Couldn't determine your location — check your device's location services";

// ---- Map image export ----
/** Why an image can't be saved yet, by reason (utils/mapExport.ts). */
export const MAP_EXPORT_BLOCKED_MESSAGES = {
  timeout: 'The map is still loading, so the image would be missing routes. Try again in a moment.',
  'no-routes': 'No routes are showing in this view yet. Move the map to an area with service and try again.',
  'failed-networks': 'Some transit networks did not load, so the image would be missing routes. Reload the page and try again.',
} as const;
export const MAP_EXPORT_NOT_READY = 'The map was not ready. Try again in a moment.';
export const MAP_EXPORT_WAITING = 'Map still loading. The image will save once every route is drawn.';

// ---- Site ----
export const UPDATE_AVAILABLE_NOTICE = 'A newer version of this page is available.';
export const ANALYTICS_CONSENT_PROMPT = 'Optional analytics help improve Atlas.';
export const ANALYTICS_SETTING_NOTE = 'Optional analytics helps us understand which parts of Atlas people use.';
export const VIEW_ERROR_TEXT = 'Something went wrong loading this view.';
export const MAP_ERROR_TEXT = 'The map encountered an error.';
export const NOT_FOUND_TITLE = 'This page took the wrong route';
export const NOT_FOUND_BODY = "We couldn't find that page.";
export const AGENCY_PAGE_NOT_FOUND_TITLE = 'No page for this agency';
export const AREA_PAGE_NOT_FOUND_TITLE = 'No page for this region';
export const NO_FREQUENCY_PAGE_BODY = 'Atlas has no frequency page at this address.';
