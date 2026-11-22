/**
 * #1692: credits a feed's publisher requires wherever its data shows, separate from the agency's own licence
 * (dataLicense). The 511 Data Disseminator Agreement asks for "powered by 511.org" (or "data provided by 511.org")
 * with a link to 511.org near the data, for every agency Atlas reads through the 511 API. The catalog build sets
 * `feedCredit` from the config's feed URL, so the browser never sees the URL itself.
 */
export const FEED_CREDITS = {
  // Ryan, 2026-11-22: "2": About reads "Data provided by 511.org". The map line's own form is still to be settled.
  '511': { label: 'Data provided by 511.org', href: 'https://511.org/', hosts: ['api.511.org'] },
} as const;

export type FeedCreditKey = keyof typeof FEED_CREDITS;

/** The credit a feed URL's publisher requires, if any. */
export function feedCreditFor(feedUrl: unknown): FeedCreditKey | undefined {
  if (typeof feedUrl !== 'string') return undefined;
  let host: string;
  try { host = new URL(feedUrl).hostname.toLowerCase(); } catch { return undefined; }
  return (Object.keys(FEED_CREDITS) as FeedCreditKey[]).find(key => (FEED_CREDITS[key].hosts as readonly string[]).includes(host));
}
