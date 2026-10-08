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
  periodLabel: string;
  periodRange: string;
}): string {
  return `Service runs about every 30 minutes: ${options.activeRange}. ${options.periodLabel} service is measured from ${options.periodRange}; this route is shown because you selected it.`;
}

export function periodServiceNotice(periodLabel: string, periodRange: string, partial: boolean): { title: string; detail: string } {
  return partial
    ? {
      title: `Limited service during ${periodLabel}`,
      detail: `Service only runs for part of this period (${periodRange}).`,
    }
    : {
      title: `No scheduled service during ${periodLabel}`,
      detail: `${periodRange}. It is hidden from the map for this period.`,
    };
}

export function unevenServiceNotice(periodLabel: string, longestGap: number): { title: string; detail: string } {
  return {
    title: `Service is uneven during ${periodLabel}.`,
    detail: `Longest gap: ${longestGap} minutes.`,
  };
}

export function selectedRouteOutsideFilterNotice(maxHeadway: number, periodLabel: string): string {
  return `This route does not meet the ${maxHeadway}-minute filter across the full ${periodLabel} window. The full route remains visible because it is selected.`;
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
