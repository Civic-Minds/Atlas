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
    return `Atlas has checked for a new timetable ${options.count} ${plural(options.count, 'time')} since ${formatStoredDate(options.since)}, most recently on ${formatStoredDate(options.lastChecked)}.`;
  }
  if (options.lastRefreshed && formatStoredDate(options.lastRefreshed)) {
    return `Atlas last successfully refreshed the feed on ${formatStoredDate(options.lastRefreshed)}.`;
  }
  return '';
}
