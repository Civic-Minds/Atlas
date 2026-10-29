/**
 * Reads the every-agency search index (CIV-1048) of the live data release. Layout and word keys:
 * shared/searchIndex.ts. A release without an index (older ones) gives null, and search then
 * covers loaded agencies only, as before.
 */
import { R2_PUBLIC_URL } from '../../shared/config';
import {
  indexedWords,
  queryStopKey,
  searchIndexKey,
  searchPageKey,
  searchRoutesKey,
  searchStopsKey,
  stopPageOf,
  type SearchIndexFile,
  type SearchPageFile,
  type SearchRoutesFile,
  type SearchStopsFile,
} from '../../shared/searchIndex';
import { dataReleaseAssetUrl, resolveDataRelease, type DataRelease } from './dataRelease';

const cache = new Map<string, Promise<unknown>>();

function fetchJsonOnce<T>(url: string): Promise<T | null> {
  let hit = cache.get(url) as Promise<T | null> | undefined;
  if (!hit) {
    hit = fetch(url)
      .then(res => (res.ok ? res.json() as Promise<T> : null))
      .catch(() => {
        // A network failure may pass; let the next keystroke try again.
        cache.delete(url);
        return null;
      });
    cache.set(url, hit);
  }
  return hit;
}

function releasePrefix(release: DataRelease): string {
  return release.agencyPrefix.replace(/\/agencies\/?$/, '');
}

const contentUrl = (key: string) => `${R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;

export async function loadSearchRoutes(): Promise<SearchRoutesFile | null> {
  const release = await resolveDataRelease().catch(() => null);
  if (!release) return null;
  return fetchJsonOnce<SearchRoutesFile>(dataReleaseAssetUrl(release, searchRoutesKey(releasePrefix(release))));
}

/** The stop split for a query, or null when the release has no index or no word names a split. */
export async function loadSearchStops(query: string): Promise<SearchStopsFile | null> {
  const release = await resolveDataRelease().catch(() => null);
  if (!release) return null;
  const index = await fetchJsonOnce<SearchIndexFile>(dataReleaseAssetUrl(release, searchIndexKey(releasePrefix(release))));
  if (!index) return null;
  const pageKeys = [...new Set(indexedWords(query).map(stopPageOf))].filter(k => index.pages[k]);
  const pages = new Map<string, SearchPageFile>();
  await Promise.all(pageKeys.map(async k => {
    const page = await fetchJsonOnce<SearchPageFile>(contentUrl(searchPageKey(index.pages[k])));
    if (page) pages.set(k, page);
  }));
  const entryOf = (key: string) => pages.get(stopPageOf(key))?.[key];
  const key = queryStopKey(query, k => entryOf(k)?.[1]);
  if (!key) return null;
  return fetchJsonOnce<SearchStopsFile>(contentUrl(searchStopsKey(entryOf(key)![0])));
}
