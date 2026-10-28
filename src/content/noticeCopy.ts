import { joinList, plural } from '../../shared/overflowText';
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
  return ended;
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
    ? `Limited service during the selected ${keepRangeTogether(activeRange || periodRange)} period.`
    : `No scheduled service during the selected ${keepRangeTogether(periodRange)} period.`;
}

export function unevenServiceNotice(longestGap: number): string {
  return `Service runs all period, but unevenly, with a longest gap of ${delayAmount(longestGap)}.`;
}

export const NO_ROUTE_SHAPE_NOTICE = 'Route map unavailable.';

/** CIV-1006: a route riders must book ahead (Ryan's wording). */
export const BOOKING_REQUIRED_NOTICE = 'Rides on this route must be booked ahead.';

export const NO_ROUTE_SHAPE_EXPLANATION =
  'This route\'s source feed includes schedule information but does not include a usable map shape.';

export const NO_ROUTE_SHAPE_DETAIL =
  'Atlas can still show the route\'s schedule, stops, and frequency, but it cannot draw the route line.';

export function selectedRouteOutsideFilterNotice(maxHeadway: number): string {
  return maxHeadway === Infinity
    ? 'This route does not run during the selected period.'
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
    return `We've checked for a new timetable ${options.count} ${plural(options.count, 'time')} since ${formatStoredDate(options.since)}, with our most recent check on ${formatStoredDate(options.lastChecked)}.`;
  }
  if (options.lastRefreshed && formatStoredDate(options.lastRefreshed)) {
    return `The feed was last refreshed on ${formatStoredDate(options.lastRefreshed)}.`;
  }
  return '';
}

// ---- Live ----
// Live's notice, empty-state and error texts (CIV-1045), word for word as they were in the Live components.
// Live's own figure wording stays in shared/liveWording.ts.

/** A Live section that failed to draw (its error boundary). */
export const liveDrawError = (what: string) => `${what} could not be drawn: the analysis file may be from an older version.`;
export const LIVE_METHOD_DRAW_ERROR = 'How this is measured could not be drawn.';
export const liveNoAgencyAnalysis = (agency: string) => `Live has no route analysis for ${agency}.`;
export const LIVE_API_NO_ANSWER = 'The Live API did not answer. Start Live with "npm run live" and open this page on the address it prints.';
export const LIVE_OFF_TITLE = 'Live is switched off in this copy of Atlas';
/** The switched-off page's line, in parts around its two code snippets. */
export const LIVE_OFF_BODY = { start: 'Live only runs on your own computer. Start it with', command: 'npm run live', middle: 'and open', path: '/apps/live', end: 'on the address it prints.' } as const;

/** Why a picked route has no vehicles on the Live map. */
export function liveRouteEmptyNotice(agencyName: string, routeShortName: string, polled: boolean, followed: readonly string[]): string {
  if (!polled) {
    return followed.length > 0
      ? `Live does not follow ${agencyName} ${routeShortName}. It follows ${agencyName} routes ${followed.join(', ')}.`
      : `Live does not follow any ${agencyName} routes.`;
  }
  return `No ${agencyName} ${routeShortName} vehicles are running right now. Live checks again every few seconds.`;
}
export const LIVE_NO_VEHICLES_ON_ROUTE = 'No vehicles on this route';
export const LIVE_NO_ROUTE_MATCHES = 'No routes match your search.';
export const LIVE_REPLACEMENT_BUSES = 'Replacement buses: all figures describe the buses running this route';
export const LIVE_FEED_INCOMPLETE = 'Live feed incomplete right now';
/** Every feed in view failed: the line, then the retry note under it (approved, CIV-941 #55). */
export const LIVE_FEEDS_UNAVAILABLE = "Live buses in this area can't be shown right now.";
export const LIVE_FEEDS_DOWN = 'Atlas will keep trying.';
/** Some feeds in view failed while others work: "Live buses from TTC and YRT can't be shown right now." (approved, CIV-941 #57). */
export const liveUnreachableText = (agencyNames: readonly string[]) => `Live buses from ${joinList(agencyNames)} can't be shown right now.`;
export const LIVE_GAP_NOT_SEEN = "The car ahead's passing wasn't seen";

export const LIVE_NO_WEEK_COMPARISON = 'No comparison with last week';
export const LIVE_WEEK_NOT_IN_FILE = 'This week against last week is not in this analysis file.';
export const LIVE_WEEK_NOT_IN_FILES = 'This week against last week is not in the analysis files yet.';
export const LIVE_NO_STOPS_MEASURED = 'No stops were measured.';
export const LIVE_NO_STOP_TO_RANK = 'No stop has enough departures to rank.';
export const LIVE_NO_STOP_TO_RANK_YET = 'No stop has enough departures to rank yet.';
export const LIVE_NO_STRETCH_STANDS_OUT = 'No stretch stands out on the analysed routes.';
export const LIVE_NO_FREQUENT_STOP = 'No stop on this route has a vehicle every 15 minutes or better in this time of day.';
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
// N25 listing-ended (Ryan's exact text, CIV-1011; shown since CIV-1055). Defined beside the agency page text it shares.
export { listingEndedNotice, listingEndedPageLine, listingEndHasPassed } from '../../shared/agencyPages';

// ---- E1 Outdated schedule: three paragraphs, Ryan's approved text (CIV-1051) ----
// (1) the issue, (2) what we're doing about it, (3) what the reader can do. No labels on the site.
/** E1, N25 version, paragraph 1: "ends" before the listing-end date, "ended" from it on. */
export function listingEndedPanelLead(agencyName: string, date: string, ended: boolean): string {
  const { primary } = agencyNames(agencyName).card;
  return `${primary}'s scheduled service for most routes ${ended ? 'ended' : 'ends'} ${date}, and they have not released updated data. The map shows the last full week in their schedule, for every route.`;
}
/** E1 paragraph 2 start (N2 and N25 versions; N3 uses N76 instead). */
export const E1_WEEKLY_CHECK = 'We check for new schedules every week.';
/** E1 paragraph 3, above Check current schedules and Report a problem. */
export const E1_AGENCY_WEBSITE = "A newer schedule may be on the agency's website.";
