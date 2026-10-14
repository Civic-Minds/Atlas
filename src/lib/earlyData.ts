/**
 * Requests that index.html starts before the app code loads: the data-release pointer and the first
 * 16 KB (header and root directory) of each PMTiles archive. Each result is handed over once; when
 * the early request failed or is missing, callers make their own request as before.
 */
export interface EarlyReleaseResponse { status: number; value?: unknown }
export interface EarlyHeaderBytes { data: ArrayBuffer; etag: string | null }

interface EarlyData {
  base: string;
  release: Promise<EarlyReleaseResponse | null>;
  header: Record<string, Promise<EarlyHeaderBytes | null> | undefined>;
}

declare global {
  interface Window { __atlasEarly?: EarlyData }
}

export function takeEarlyRelease(baseUrl: string): Promise<EarlyReleaseResponse | null> | null {
  if (typeof window === 'undefined') return null;
  const early = window.__atlasEarly;
  if (!early || early.base !== baseUrl.replace(/\/$/, '')) return null;
  window.__atlasEarly = { ...early, base: '' };
  return early.release;
}

export function takeEarlyHeader(url: string): Promise<EarlyHeaderBytes | null> | null {
  if (typeof window === 'undefined') return null;
  const early = window.__atlasEarly;
  const request = early?.header[url];
  if (!early || !request) return null;
  delete early.header[url];
  return request;
}
