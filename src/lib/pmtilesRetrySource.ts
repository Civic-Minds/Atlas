import { FetchSource, type Source, type RangeResponse } from 'pmtiles';

/**
 * Wraps pmtiles' stock FetchSource with retry + backoff on transient failures
 * (429/5xx). The default Source has none — a single rate-limit response on any
 * tile request silently drops that tile with no recovery and no visible error.
 * Confirmed reproducible: heavy R2 traffic (repeated verify-pmtiles-coverage
 * runs) triggered 429s and the map went fully blank until a manual reload.
 */
export class RetryingFetchSource implements Source {
  private inner: FetchSource;
  private maxRetries: number;

  constructor(url: string, maxRetries = 4) {
    this.inner = new FetchSource(url);
    this.maxRetries = maxRetries;
  }

  getKey(): string {
    return this.inner.getKey();
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.inner.getBytes(offset, length, signal, etag);
      } catch (e) {
        if (signal?.aborted) throw e;
        const message = (e as Error).message || '';
        const isTransient = /Bad response code: (429|5\d\d)/.test(message);
        if (attempt >= this.maxRetries || !isTransient) throw e;
        const delayMs = 300 * 2 ** attempt + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}
