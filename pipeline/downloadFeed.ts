import { execFileSync } from 'node:child_process';

/** CIV-2976 D4: the one feed download's limits, the larger of the copies it replaced (refresh's was 120 s / 64 MB). */
export const FEED_DOWNLOAD_TIMEOUT_MS = 180_000;
export const FEED_DOWNLOAD_MAX_BYTES = 128 * 1024 * 1024;
const FEED_DOWNLOAD_USER_AGENT = 'atlas-frequency-map/1.0';

/**
 * Download a GTFS zip, falling back to curl for hosts whose TLS chain Node rejects (e.g. NFTA; curl uses the system
 * trust store). The one copy (CIV-2976 D4): refresh, the agency feed loader and process-gtfs all read it.
 */
export async function downloadFeedBuffer(url: string): Promise<Buffer> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': FEED_DOWNLOAD_USER_AGENT },
      signal: AbortSignal.timeout(FEED_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (fetchError) {
    try {
      return execFileSync('curl', ['-fsSL', url], { maxBuffer: FEED_DOWNLOAD_MAX_BYTES, timeout: FEED_DOWNLOAD_TIMEOUT_MS });
    } catch {
      throw fetchError instanceof Error ? fetchError : new Error(String(fetchError));
    }
  }
}
