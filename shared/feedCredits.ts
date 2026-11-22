/**
 * #1692: credits a feed's publisher requires wherever its data shows, separate from the agency's own licence
 * (dataLicense). The 511 Data Disseminator Agreement asks for "powered by 511.org" (or "data provided by 511.org")
 * with a link to 511.org near the data, for every agency Atlas reads through the 511 API. The catalog build sets
 * `feedCredit` from the config's feed URL, so the browser never sees the URL itself.
 */
export const FEED_CREDITS = {
  '511': { label: 'Powered by 511.org', href: 'https://511.org/', hosts: ['api.511.org'] },
} as const;

export type FeedCreditKey = keyof typeof FEED_CREDITS;

/** The credit a feed URL's publisher requires, if any. */
export function feedCreditFor(feedUrl: unknown): FeedCreditKey | undefined {
  if (typeof feedUrl !== 'string') return undefined;
  let host: string;
  try { host = new URL(feedUrl).hostname.toLowerCase(); } catch { return undefined; }
  return (Object.keys(FEED_CREDITS) as FeedCreditKey[]).find(key => (FEED_CREDITS[key].hosts as readonly string[]).includes(host));
}
