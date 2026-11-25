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
/**
 * #1799: Cloudflare lets one invocation hold 6 connections open at once; more fetches wait in a queue while their
 * timeout already runs, so the last feeds of a busy run timed out (Burlington, last of eight agencies, missed about half
 * its slots). Fetches beyond this wait here, before their timeout starts.
 */
export const MAX_OPEN_FETCHES = 6;
let open = 0;
const waiting: Array<() => void> = [];
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (open >= MAX_OPEN_FETCHES) await new Promise<void>(resolve => waiting.push(resolve));
  open++;
  try { return await work(); } finally { open--; waiting.shift()?.(); }
}

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
    // The body is read inside the slot too, so the connection stays counted until the feed is in.
    const res = await slot(async () => {
      const r = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
      return r.status >= 500 ? r : new Response(await r.arrayBuffer(), { status: r.status, statusText: r.statusText, headers: r.headers });
    });
    if (res.status < 500 || attempt >= FEED_RETRIES) return res;
    // Free the failed body before waiting so the connection can be reused.
    await res.body?.cancel();
    await sleep(FEED_RETRY_DELAY_MS);
  }
}
