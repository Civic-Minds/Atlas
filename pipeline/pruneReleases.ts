/**
 * Delete old data releases from R2, keeping the live release plus the previous ones
 * (RELEASES_TO_KEEP in releasePrune.ts). Only ever touches atlas/releases/<id>/ keys.
 */
import { r2Get, r2ListObjects, r2DeleteKeys } from './r2.js';
import { RELEASE_HISTORY_KEY, parseReleaseHistory } from '../shared/releaseHistory.js';
import { assertDeletableKeys, planReleasePrune, releaseIdOfKey, type PrunePlan } from './releasePrune.js';

export interface PruneResult {
  plan: PrunePlan;
  deletedKeys: number;
  deletedBytes: number;
  bytesById: Record<string, number>;
}

export async function pruneOldReleases(opts: { dryRun: boolean }): Promise<PruneResult> {
  const liveRaw = await r2Get('atlas/release.json');
  if (!liveRaw) throw new Error('atlas/release.json is missing; not pruning.');
  const liveText = liveRaw;
  const liveId = (JSON.parse(liveText) as { releaseId?: string }).releaseId;
  if (!liveId) throw new Error('atlas/release.json has no releaseId; not pruning.');
  const historyRaw = await r2Get(RELEASE_HISTORY_KEY);
  const history = historyRaw ? parseReleaseHistory(JSON.parse(historyRaw)) : [];

  const objects = await r2ListObjects('atlas/releases/');
  const byId = new Map<string, { keys: string[]; bytes: number }>();
  for (const obj of objects) {
    const id = releaseIdOfKey(obj.key);
    if (!id) continue; // anything not under atlas/releases/<id>/ is never ours to touch
    const entry = byId.get(id) ?? { keys: [], bytes: 0 };
    entry.keys.push(obj.key);
    entry.bytes += obj.size ?? 0;
    byId.set(id, entry);
  }

  const plan = planReleasePrune({ existingIds: [...byId.keys()], liveId, history });
  // Every release id the live pointer references must be kept.
  const referenced = new Set(liveText.match(/release-[a-z0-9]+/g) ?? []);
  for (const id of referenced) {
    if (plan.delete.includes(id)) throw new Error(`atlas/release.json references ${id}, which the plan would delete; not pruning.`);
  }

  const keys = plan.delete.flatMap(id => byId.get(id)!.keys);
  assertDeletableKeys(keys, plan);
  const bytesById: Record<string, number> = {};
  for (const id of plan.delete) bytesById[id] = byId.get(id)!.bytes;
  const deletedBytes = Object.values(bytesById).reduce((a, b) => a + b, 0);

  console.log(`Release prune: live ${liveId}, keeping ${plan.keep.join(', ')}.`);
  if (plan.skippedNewer.length) console.log(`  Skipping releases newer than live: ${plan.skippedNewer.join(', ')}`);
  for (const id of plan.delete) {
    console.log(`  ${opts.dryRun ? 'Would delete' : 'Deleting'} ${id}: ${byId.get(id)!.keys.length} files, ${(bytesById[id] / 1e9).toFixed(2)} GB`);
  }
  if (opts.dryRun || keys.length === 0) {
    console.log(opts.dryRun ? '  Dry run; nothing deleted.' : '  Nothing to prune.');
    return { plan, deletedKeys: 0, deletedBytes: 0, bytesById };
  }
  const deletedKeys = await r2DeleteKeys(keys);
  console.log(`  Deleted ${deletedKeys} files (${(deletedBytes / 1e9).toFixed(2)} GB).`);
  return { plan, deletedKeys, deletedBytes, bytesById };
}
