import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEED_RETRIES, FEED_RETRY_DELAY_MS, fetchFeed } from './fetchFeed';

// CIV-2183 / #1741: opendata.hamilton.ca answers HTTP 530 about one minute in twenty.
function stubFetch(...statuses: number[]) {
  const mock = vi.fn(async () => new Response(`body ${statuses[0]}`, { status: statuses.shift() ?? 200 }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchFeed', () => {
  it('retries a 5xx once after the retry delay and returns the good answer', async () => {
    const fetchMock = stubFetch(530, 200);
    const sleep = vi.fn(async () => {});
    const res = await fetchFeed('https://feed.example/vp', { headers: { 'User-Agent': 'test' }, sleep });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(FEED_RETRY_DELAY_MS);
  });

  it('gives up after the allowed retries and returns the last 5xx for the caller to report', async () => {
    const fetchMock = stubFetch(530, 503, 200);
    const res = await fetchFeed('https://feed.example/vp', { sleep: async () => {} });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1 + FEED_RETRIES);
  });

  it('does not retry a good answer or a 4xx', async () => {
    for (const status of [200, 404]) {
      const fetchMock = stubFetch(status);
      const sleep = vi.fn(async () => {});
      const res = await fetchFeed('https://feed.example/vp', { sleep });
      expect(res.status).toBe(status);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it('keeps the retry inside the minute even when both attempts hit the time limit', async () => {
    const { FEED_TIMEOUT_MS } = await import('./fetchFeed');
    expect((1 + FEED_RETRIES) * FEED_TIMEOUT_MS + FEED_RETRIES * FEED_RETRY_DELAY_MS).toBeLessThan(60_000);
  });
});

describe('open fetches (#1799)', () => {
  it('holds at most MAX_OPEN_FETCHES connections open at once', async () => {
    const { fetchFeed, MAX_OPEN_FETCHES } = await import('./fetchFeed');
    let openNow = 0, most = 0;
    const release: Array<() => void> = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => { openNow++; most = Math.max(most, openNow); await new Promise<void>(r => release.push(r)); openNow--; return new Response('x', { status: 200 }); }) as typeof fetch;
    try {
      const all = Promise.all(Array.from({ length: MAX_OPEN_FETCHES + 4 }, () => fetchFeed('https://example.test/feed.pb')));
      for (let i = 0; i < 40 && release.length + 0 < MAX_OPEN_FETCHES + 4; i++) { await new Promise(r => setTimeout(r, 1)); while (release.length) release.shift()!(); }
      await all;
      expect(most).toBeLessThanOrEqual(MAX_OPEN_FETCHES);
    } finally { globalThis.fetch = orig; }
  });
});
