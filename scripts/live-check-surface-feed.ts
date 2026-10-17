/**
 * Has the TTC published a new surface GTFS? (CIV-297) A read-only HEAD request on the Mobility Database mirror of the feed
 * Live reads (mdb-2253, "Static feed for beta realtime feed"); nothing is downloaded or written.
 *   npx tsx scripts/live-check-surface-feed.ts
 * Compares the file's ETag, Last-Modified and size with those of the stored feed S1000542 (valid to 2026-10-31). A change
 * means "download it and check its feed_version", not "a new feed is out": a re-upload can change the ETag alone.
 * Exit code 0: unchanged. 10: changed. 1: the check itself failed.
 */
export const SURFACE_FEED_URL = 'https://files.mobilitydatabase.org/mdb-2253/latest.zip';
/** What the mirror served when S1000542 (start 2026-09-30, end 2026-10-31) was stored. */
export const KNOWN_FEED = { version: 'S1000542', etag: '"76ad375d06986541edf68a48ab10f5d3"', lastModified: 'Tue, 29 Sep 2026 00:48:04 GMT', length: 83084610 };

export interface FeedHeaders { etag: string | null; lastModified: string | null; length: number | null }

/** What differs from the stored feed; empty when the file looks the same. */
export function feedChanges(h: FeedHeaders, known = KNOWN_FEED): string[] {
  const out: string[] = [];
  if (h.etag !== known.etag) out.push(`ETag ${h.etag ?? 'missing'} (was ${known.etag})`);
  if (h.lastModified !== known.lastModified) out.push(`Last-Modified ${h.lastModified ?? 'missing'} (was ${known.lastModified})`);
  if (h.length !== known.length) out.push(`size ${h.length ?? 'missing'} bytes (was ${known.length})`);
  return out;
}

async function main() {
  const res = await fetch(SURFACE_FEED_URL, { method: 'HEAD', redirect: 'follow' });
  if (!res.ok) { console.error(`live-check-surface-feed: ${SURFACE_FEED_URL} answered ${res.status}`); process.exit(1); }
  const len = res.headers.get('content-length') ?? res.headers.get('x-goog-stored-content-length');
  const changes = feedChanges({ etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'), length: len ? Number(len) : null });
  if (!changes.length) { console.log(`unchanged: the mirror still serves ${KNOWN_FEED.version} (no new surface feed yet)`); return; }
  console.log(`CHANGED: the file at ${SURFACE_FEED_URL} differs from ${KNOWN_FEED.version}:`);
  for (const c of changes) console.log(`  - ${c}`);
  console.log('Download it and check its feed_version (a new feed has a different one and a start on or before 2026-11-01), then: npx tsx scripts/live-store-surface-gtfs.ts surfacegtfs.zip');
  process.exit(10);
}

if (process.argv[1]?.endsWith('live-check-surface-feed.ts')) await main().catch(e => { console.error(`live-check-surface-feed: ${(e as Error).message}`); process.exit(1); });
