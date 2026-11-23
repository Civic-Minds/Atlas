/**
 * CIV-2183 / #1741: one feed fetch for every archiver shard, with one short retry on a 5xx answer.
 *
 * opendata.hamilton.ca answers HTTP 530 (Cloudflare can't reach the origin) about one minute in twenty; a second try a
 * few seconds later, inside the same minute, usually gets the feed. Only server errors are retried: a 4xx, a timeout or a
 * network failure is returned or thrown as before, so a broken feed doesn't double its wall time every run.
 */

/** Each attempt's time limit. */
export const FEED_TIMEOUT_MS = 15_000;
/** Wait before the retry: long enough for a passing origin hiccup, short enough to stay inside the minute. */
export const FEED_RETRY_DELAY_MS = 3_000;
/** Retries after the first attempt (so at most two fetches a feed a run). */
export const FEED_RETRIES = 1;

export interface FetchFeedOptions {
  headers?: Record<string, string>;
  /** Test hook: replaces the wait before a retry. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Fetches a feed, retrying a 5xx answer up to FEED_RETRIES times. Returns the last response; the caller checks `ok`. */
export async function fetchFeed(url: string, options: FetchFeedOptions = {}): Promise<Response> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (res.status < 500 || attempt >= FEED_RETRIES) return res;
    // Free the failed body before waiting so the connection can be reused.
    await res.body?.cancel();
    await sleep(FEED_RETRY_DELAY_MS);
  }
}
