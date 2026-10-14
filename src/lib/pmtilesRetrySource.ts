import { FetchSource, type Source, type RangeResponse } from 'pmtiles';
import { takeEarlyHeader } from './earlyData';

/** The PMTiles library reads the header and root directory as the first 16 KB of the archive. */
const HEADER_BYTES = 16384;

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
  private url: string;

  constructor(url: string, maxRetries = 4) {
    this.inner = new FetchSource(url);
    this.maxRetries = maxRetries;
    this.url = url;
  }

  getKey(): string {
    return this.inner.getKey();
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
    const isHeader = offset === 0 && length === HEADER_BYTES;
    if (isHeader) {
      // index.html already asked for these bytes while the app code was still loading.
      const early = await takeEarlyHeader(this.url);
      if (early) return { data: early.data, etag: early.etag && !early.etag.startsWith('W/') ? early.etag : undefined };
    }
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
