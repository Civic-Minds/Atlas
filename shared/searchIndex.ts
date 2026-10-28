/**
 * The every-agency search index (CIV-1048): route names and stop names for agencies the map has not
 * loaded. The pipeline writes it with each data release and the app reads it, so both sides use the
 * word keys defined here.
 *
 * Layout:
 * - `{releasePrefix}/search/routes.json`: every route, one file.
 * - `{releasePrefix}/search/index.json`: for each first character, the hash of a page that maps
 *   word keys to stop-split hashes.
 * - `atlas/search/pages/{hash}.json` and `atlas/search/stops/{hash}.json`: content-addressed, so a
 *   release uploads only the files that changed and older releases keep working.
 */
import { searchFold } from './areaSearch';

export const SEARCH_INDEX_VERSION = 1;
export const SEARCH_CONTENT_PREFIX = 'atlas/search';

/** Words too common to be worth a split of their own; a name is still found by its other words. */
export const SEARCH_COMMON_WORDS: ReadonlySet<string> = new Set((
  'and the ave avenue blvd boulevard street road drive hwy highway pkwy parkway way lane court place '
  + 'after before opp opposite north south east west northbound southbound eastbound westbound '
  + 'station center centre stop bay platform far near side corner'
).split(' '));

/** Words shorter than this are not indexed, and a query needs one word at least this long. */
export const SEARCH_MIN_WORD = 3;

/** The searchable words of a stop name or query, folded (lower case, no accents). */
export function searchWords(text: string): string[] {
  return searchFold(text).match(/[0-9a-z]+/g) ?? [];
}

/** Words a stop name is filed under: long enough and not common. */
export function indexedWords(name: string): string[] {
  return [...new Set(searchWords(name).filter(w => w.length >= SEARCH_MIN_WORD && !SEARCH_COMMON_WORDS.has(w)))];
}

/** Splits are divided by one more character while too large, up to keys this long. */
export const SEARCH_MAX_KEY = 6;

/**
 * The split a query reads. Each indexed word of the query names one key: its first three
 * characters, or more where that split was too large and was divided; a word that ends where its
 * split was divided is under `${word}_`. Of those, the smallest split wins, since every word of a
 * match is in the name. `sizeOf` gives a key's size in the release, or undefined when it has none.
 * Null when no word names a split (for example a common prefix not typed far enough into).
 */
export function queryStopKey(query: string, sizeOf: (key: string) => number | undefined): string | null {
  let best: { key: string; size: number } | null = null;
  for (const w of indexedWords(query)) {
    for (let len = SEARCH_MIN_WORD; len <= Math.min(w.length, SEARCH_MAX_KEY); len++) {
      const prefix = w.slice(0, len);
      const key = sizeOf(prefix) !== undefined ? prefix : len === w.length && sizeOf(`${prefix}_`) !== undefined ? `${prefix}_` : null;
      if (!key) continue;
      const size = sizeOf(key)!;
      if (!best || size < best.size) best = { key, size };
      break;
    }
  }
  return best?.key ?? null;
}

/** The page holding a key's hash: one page per first character. */
export function stopPageOf(key: string): string {
  return key.charAt(0);
}

/** routes.json: one row per distinct route name per agency. */
export interface SearchRoutesFile {
  v: number;
  agencies: string[];
  /** [agency index, routeId, short name, long name, route type, lat, lon] */
  routes: Array<[number, string, string, string, number | null, number, number]>;
}

/** index.json: page hash per first character. */
export interface SearchIndexFile {
  v: number;
  pages: Record<string, string>;
}

/** A page: word key to [stop-split hash, split size in bytes]. */
export type SearchPageFile = Record<string, [string, number]>;

/** A stop split: agency slug to [name, stopId, lat, lon, stopId, lat, lon, ...] (one stop per kilometre-apart copy). */
export type SearchStopsFile = Record<string, Array<Array<string | number>>>;

export function searchRoutesKey(releasePrefix: string): string {
  return `${releasePrefix.replace(/\/$/, '')}/search/routes.json`;
}

export function searchIndexKey(releasePrefix: string): string {
  return `${releasePrefix.replace(/\/$/, '')}/search/index.json`;
}

export function searchPageKey(hash: string): string {
  return `${SEARCH_CONTENT_PREFIX}/pages/${hash}.json`;
}

export function searchStopsKey(hash: string): string {
  return `${SEARCH_CONTENT_PREFIX}/stops/${hash}.json`;
}
