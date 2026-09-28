import { agencyDisplayParts } from '../utils/format';

/** Shared user-facing copy for every expired-feed notice. */
export function expiredFeedNotice(agencyName: string, expDateStr?: string): string {
  const { primary, secondary } = agencyDisplayParts(agencyName);
  const label = secondary ? `the ${primary} schedule for ${secondary}` : `${primary}'s schedule`;
  return `Atlas's latest ${label} ended${expDateStr ? ` on ${expDateStr}` : ''}. We haven't been able to locate and verify a newer feed yet.`;
}

export const EXPIRED_FEED_EXPLANATION =
  'Atlas keeps showing the most recent feed it could verify while we look for a newer public feed.';

export const EXPIRED_FEED_CONTEXT =
  'A newer schedule may exist on the agency\'s website without a downloadable feed Atlas can verify.';
