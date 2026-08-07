/**
 * Public atlas data-version stamp on R2.
 *
 * Browsers cache agency GeoJSON in IndexedDB keyed by this value. It must live on R2
 * (not only in the SPA bundle) so a process/refresh/pmtiles publish invalidates client
 * caches without waiting for a frontend deploy.
 */
import { r2Put } from './r2.js';

export const DATA_VERSION_KEY = 'atlas/data-version.json';

export interface PublicDataVersion {
  /** Opaque stamp used as the client cache key. */
  v: string;
  updatedAt: string;
}

/** Write a fresh data-version stamp so browsers re-fetch GeoJSON/PMTiles after publish. */
export async function bumpPublicDataVersion(reason?: string): Promise<PublicDataVersion> {
  const stamp: PublicDataVersion = {
    v: `${Date.now().toString(36)}`,
    updatedAt: new Date().toISOString(),
  };
  await r2Put(
    DATA_VERSION_KEY,
    JSON.stringify(stamp),
    // Always revalidate — this file is the cache-busting signal itself.
    'application/json',
  );
  console.log(
    `  data-version.json → R2 (v=${stamp.v}${reason ? `, ${reason}` : ''})`,
  );
  return stamp;
}
