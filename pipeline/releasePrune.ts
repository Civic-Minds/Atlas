/**
 * Release retention: which atlas/releases/<id>/ prefixes may be deleted.
 * Pure selection logic; publish-data-release and prune-releases do the R2 calls.
 */
import type { ReleaseHistoryEntry } from '../shared/releaseHistory.js';

/** Live release plus the previous releases kept for rollback and for clients still holding an older id. */
export const RELEASES_TO_KEEP = 3;

const RELEASE_ID = /^release-[a-z0-9]+$/;
const RELEASE_KEY = /^atlas\/releases\/(release-[a-z0-9]+)\/[^/].*$/;

/** Release ids are base36 build timestamps, so length then lexicographic order is build order. */
export function compareReleaseIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

export function releaseIdOfKey(key: string): string | null {
  return RELEASE_KEY.exec(key)?.[1] ?? null;
}

export interface PrunePlan {
  keep: string[];
  /** Older than the live release and not kept. */
  delete: string[];
  /** Newer than the live release (possibly mid-upload); never touched. */
  skippedNewer: string[];
}

/**
 * Keeps the live release plus the (keepCount - 1) releases published just before it, by history order.
 * Everything else older than live is deletable. Throws (so nothing is deleted) when the live id has no
 * prefix or history cannot name enough previous releases that still exist.
 */
export function planReleasePrune(args: {
  existingIds: string[];
  liveId: string;
  history: ReleaseHistoryEntry[];
  keepCount?: number;
}): PrunePlan {
  const keepCount = args.keepCount ?? RELEASES_TO_KEEP;
  const { liveId } = args;
  if (!RELEASE_ID.test(liveId)) throw new Error(`Live release id "${liveId}" is not a release id; not pruning.`);
  if (!Number.isInteger(keepCount) || keepCount < 1) throw new Error('keepCount must be a positive integer.');
  const existing = new Set(args.existingIds.filter(id => RELEASE_ID.test(id)));
  if (!existing.has(liveId)) throw new Error(`Live release ${liveId} has no objects under atlas/releases/; not pruning.`);

  const liveEntry = args.history.find(h => h.releaseId === liveId);
  const liveTime = liveEntry ? Date.parse(liveEntry.generatedAt) : Infinity;
  const previous = [...args.history]
    .filter(h => h.releaseId !== liveId && existing.has(h.releaseId) && Date.parse(h.generatedAt) <= liveTime)
    .sort((a, b) => Date.parse(a.generatedAt) - Date.parse(b.generatedAt))
    .map(h => h.releaseId)
    .slice(-(keepCount - 1));
  if (previous.length < keepCount - 1) {
    throw new Error(`History names only ${previous.length} earlier releases still in R2 (need ${keepCount - 1}); not pruning.`);
  }
  const keep = [...previous, liveId];
  const keepSet = new Set(keep);
  const plan: PrunePlan = { keep, delete: [], skippedNewer: [] };
  for (const id of [...existing].sort(compareReleaseIds)) {
    if (keepSet.has(id)) continue;
    if (compareReleaseIds(id, liveId) > 0) plan.skippedNewer.push(id);
    else plan.delete.push(id);
  }
  return plan;
}

/** Final gate on the exact keys to delete: each must sit under atlas/releases/<id>/ for a planned id. */
export function assertDeletableKeys(keys: string[], plan: PrunePlan): void {
  const allowed = new Set(plan.delete);
  const kept = new Set(plan.keep);
  for (const key of keys) {
    const id = releaseIdOfKey(key);
    if (!id || !allowed.has(id) || kept.has(id)) throw new Error(`Refusing to delete ${key}: not inside a prunable release prefix.`);
  }
}
