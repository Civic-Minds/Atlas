/**
 * Retention for the content-addressed search index files under atlas/search/ (CIV-1056). They are
 * shared between releases, so they are kept by reference, not by release: a file stays while any
 * release still in R2 names it (index.json -> pages -> stop splits), which ties it to the release
 * retention in releasePrune.ts. Pure selection logic; pruneSearchIndex does the R2 calls.
 */
import { compareReleaseIds, releaseIdOfKey } from './releasePrune.js';
import {
  SEARCH_CONTENT_PREFIX,
  searchIndexKey,
  searchPageKey,
  searchStopsKey,
  type SearchIndexFile,
  type SearchPageFile,
} from '../shared/searchIndex.js';

/** A file newer than this is never deleted: a build uploads its splits before its index.json names them. */
export const SEARCH_PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;

const CONTENT_KEY = new RegExp(`^${SEARCH_CONTENT_PREFIX}/(pages|stops)/[0-9a-f]{16}\\.json$`);

export interface SearchObject {
  key: string;
  lastModified: Date | null;
  size: number | null;
}

export interface SearchPrunePlan {
  keep: string[];
  delete: string[];
  /** Unreferenced but too new to delete. */
  recent: string[];
  /** Under atlas/search/ but not a content-addressed file; never touched. */
  foreign: string[];
}

/** Every content key one release's index names: its pages, and every split those pages name. */
export function referencedSearchKeys(index: SearchIndexFile, pages: ReadonlyMap<string, SearchPageFile>): string[] {
  const keys: string[] = [];
  for (const hash of Object.values(index.pages)) {
    keys.push(searchPageKey(hash));
    const page = pages.get(hash);
    if (!page) throw new Error(`Search page ${hash} is named by an index but could not be read; not pruning.`);
    for (const [splitHash] of Object.values(page)) keys.push(searchStopsKey(splitHash));
  }
  return keys;
}

export function planSearchPrune(args: {
  objects: SearchObject[];
  referenced: ReadonlySet<string>;
  now: number;
  graceMs?: number;
}): SearchPrunePlan {
  const grace = args.graceMs ?? SEARCH_PRUNE_GRACE_MS;
  const plan: SearchPrunePlan = { keep: [], delete: [], recent: [], foreign: [] };
  for (const obj of [...args.objects].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!CONTENT_KEY.test(obj.key)) plan.foreign.push(obj.key);
    else if (args.referenced.has(obj.key)) plan.keep.push(obj.key);
    // An unknown upload time counts as new.
    else if (!obj.lastModified || args.now - obj.lastModified.getTime() < grace) plan.recent.push(obj.key);
    else plan.delete.push(obj.key);
  }
  return plan;
}

/** Final gate on the exact keys to delete. */
export function assertDeletableSearchKeys(keys: string[], plan: SearchPrunePlan): void {
  const allowed = new Set(plan.delete);
  for (const key of keys) {
    if (!allowed.has(key) || !CONTENT_KEY.test(key)) throw new Error(`Refusing to delete ${key}: not an unreferenced search file.`);
  }
}

export interface SearchPruneIo {
  getText: (key: string) => Promise<string | null>;
  listObjects: (prefix: string) => Promise<SearchObject[]>;
  deleteKeys: (keys: string[]) => Promise<number>;
  now?: () => number;
  log?: (line: string) => void;
}

/**
 * Plan (and with dryRun false, run) the search prune. Refuses, deleting nothing, when the live
 * release has no search index or any index or page it names cannot be read.
 */
export async function pruneSearchIndex(opts: { dryRun: boolean }, io: SearchPruneIo): Promise<SearchPrunePlan & { deleted: number; deleteBytes: number }> {
  const log = io.log ?? console.log;
  const liveText = await io.getText('atlas/release.json');
  const liveId = liveText ? (JSON.parse(liveText) as { releaseId?: string }).releaseId : undefined;
  if (!liveId) throw new Error('atlas/release.json is missing or has no releaseId; not pruning search files.');

  // Every release still in R2 (the live one, those kept for rollback, and any newer unpublished upload).
  const releaseIds = new Set<string>();
  for (const obj of await io.listObjects('atlas/releases/')) {
    const id = releaseIdOfKey(obj.key);
    if (id) releaseIds.add(id);
  }
  if (!releaseIds.has(liveId)) throw new Error(`Live release ${liveId} has no objects under atlas/releases/; not pruning search files.`);

  const referenced = new Set<string>();
  const withIndex: string[] = [];
  for (const id of [...releaseIds].sort(compareReleaseIds)) {
    const indexText = await io.getText(searchIndexKey(`atlas/releases/${id}`));
    if (!indexText) {
      if (id === liveId) throw new Error(`Live release ${liveId} has no search index; not pruning search files.`);
      continue; // a release from before the search index
    }
    const index = JSON.parse(indexText) as SearchIndexFile;
    const pages = new Map<string, SearchPageFile>();
    for (const hash of Object.values(index.pages)) {
      const pageText = await io.getText(searchPageKey(hash));
      if (pageText) pages.set(hash, JSON.parse(pageText) as SearchPageFile);
    }
    for (const key of referencedSearchKeys(index, pages)) referenced.add(key);
    withIndex.push(id);
  }

  const objects = await io.listObjects(`${SEARCH_CONTENT_PREFIX}/`);
  const plan = planSearchPrune({ objects, referenced, now: (io.now ?? Date.now)() });
  const sizeOf = new Map(objects.map(o => [o.key, o.size ?? 0]));
  const deleteBytes = plan.delete.reduce((sum, key) => sum + (sizeOf.get(key) ?? 0), 0);
  log(`Search prune: ${withIndex.length} of ${releaseIds.size} releases in R2 have a search index (live ${liveId}).`);
  log(`  ${objects.length} files under ${SEARCH_CONTENT_PREFIX}/: keep ${plan.keep.length}, ${opts.dryRun ? 'would delete' : 'delete'} ${plan.delete.length} (${(deleteBytes / 1e6).toFixed(1)} MB), too new ${plan.recent.length}, not ours ${plan.foreign.length}.`);
  if (opts.dryRun || plan.delete.length === 0) {
    log(opts.dryRun ? '  Dry run; nothing deleted.' : '  Nothing to prune.');
    return { ...plan, deleted: 0, deleteBytes };
  }
  assertDeletableSearchKeys(plan.delete, plan);
  const deleted = await io.deleteKeys(plan.delete);
  log(`  Deleted ${deleted} search files.`);
  return { ...plan, deleted, deleteBytes };
}
