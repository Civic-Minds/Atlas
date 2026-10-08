import { agencyDisplayParts, formatStoredDate } from '../utils/format';

/** Shared user-facing copy for every expired-feed notice. */
export function expiredFeedNotice(agencyName: string, expDateStr?: string, manualFeedSource = false): string {
  const { primary, secondary } = agencyDisplayParts(agencyName);
  const label = secondary ? `the ${primary} schedule for ${secondary}` : `${primary}'s schedule`;
  if (manualFeedSource) {
    return `Atlas's latest ${label} ended${expDateStr ? ` on ${expDateStr}` : ''}. This schedule is maintained manually, so Atlas will keep showing it until a newer file is provided and verified.`;
  }
  return `Atlas's latest ${label} ended${expDateStr ? ` on ${expDateStr}` : ''}. We haven't been able to locate and verify a newer feed yet.`;
}

export function selectedRouteFilterNotice(options: {
  activeRange: string;
  periodRange: string;
}): string {
  return `Service runs about every 30 minutes from ${options.activeRange}, but not throughout the selected ${options.periodRange} period.`;
}

export function periodServiceNotice(periodRange: string, partial: boolean, activeRange?: string): string {
  return partial
    ? `Limited service during the selected ${activeRange || periodRange} period.`
    : `No scheduled service during the selected ${periodRange} period.`;
}

export function unevenServiceNotice(longestGap: number): string {
  return `Service runs throughout the selected period, but not consistently. Longest gap: ${longestGap} minutes.`;
}

export function selectedRouteOutsideFilterNotice(maxHeadway: number): string {
  return maxHeadway === Infinity
    ? 'This route does not run during the selected period.'
    : `This route does not meet the selected ${maxHeadway}-minute filter for the full selected period.`;
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
    return `Atlas began checking this feed on ${formatStoredDate(options.since)} and has checked it ${options.count} time${options.count === 1 ? '' : 's'} since then. The most recent check was ${formatStoredDate(options.lastChecked)}.`;
  }
  if (options.lastRefreshed && formatStoredDate(options.lastRefreshed)) {
    return `Atlas last successfully refreshed the feed on ${formatStoredDate(options.lastRefreshed)}.`;
  }
  return '';
}
