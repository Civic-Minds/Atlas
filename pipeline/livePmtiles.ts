/**
 * The map tiles of the live data release (CIV-2995): the archive named by `atlas/release.json`. The legacy root
 * `atlas.pmtiles` outside any release is retired; tools that read "the deployed tiles" read these.
 */
import { R2_PUBLIC_URL } from '../shared/config.js';

export async function livePmtilesUrl(base: string = R2_PUBLIC_URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  const origin = base.replace(/\/$/, '');
  const res = await fetchImpl(`${origin}/atlas/release.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`The release pointer could not be read (${res.status}); no live map tiles to read.`);
  const { pmtilesKey } = (await res.json()) as { pmtilesKey?: unknown };
  if (typeof pmtilesKey !== 'string' || !pmtilesKey.startsWith('atlas/releases/')) {
    throw new Error('The release pointer names no release map tiles (pmtilesKey).');
  }
  return `${origin}/${pmtilesKey}`;
}
