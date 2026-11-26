/**
 * Delete old rebuild staging folders, atlas/runs/<run id>/ (CIV-2995). Keeps every run a kept release came from,
 * every run written after the live release, and the newest run (pipeline/runsPrune.ts). Dry run by default.
 *
 *   npm run prune-runs              list what would be deleted
 *   npm run prune-runs -- --apply   delete it (a live-bucket write: needs the go-ahead first)
 */
import './loadEnv.js';
import { r2DeleteKeys, r2Get, r2ListObjects } from './r2.js';
import { RELEASE_HISTORY_KEY, parseReleaseHistory } from '../shared/releaseHistory.js';
import { planReleasePrune } from './releasePrune.js';
import { RUN_PREFIX, assertDeletableRunKeys, planRunsPrune, runIdOfKey, type KeptRelease } from './runsPrune.js';
import { assertKnownFlags } from './cliFlags.js';

assertKnownFlags(process.argv.slice(2), { '--apply': 'flag' }); // CIV-3017: a mistyped flag must not turn into a real write
const apply = process.argv.includes('--apply');

const pointerText = await r2Get('atlas/release.json');
if (!pointerText) throw new Error('atlas/release.json is missing; not pruning runs.');
const liveId = (JSON.parse(pointerText) as { releaseId?: string }).releaseId;
if (!liveId) throw new Error('atlas/release.json has no releaseId; not pruning runs.');
const historyText = await r2Get(RELEASE_HISTORY_KEY);
const history = historyText ? parseReleaseHistory(JSON.parse(historyText)) : [];

// The releases prune-releases keeps, read from their own manifests.
const manifests = new Map<string, { generatedAt?: string; sourcePrefix?: string }>();
for (const id of new Set([liveId, ...history.map(h => h.releaseId)])) {
  const text = await r2Get(`atlas/releases/${id}/manifest.json`);
  if (text) manifests.set(id, JSON.parse(text));
}
const releasePlan = planReleasePrune({ existingIds: [...manifests.keys()], liveId, history });
const kept: KeptRelease[] = releasePlan.keep.map(id => ({
  releaseId: id,
  generatedAt: Date.parse(manifests.get(id)?.generatedAt ?? history.find(h => h.releaseId === id)?.generatedAt ?? ''),
  sourcePrefix: manifests.get(id)?.sourcePrefix,
  live: id === liveId,
}));
if (kept.some(r => !Number.isFinite(r.generatedAt))) throw new Error('A kept release has no build time; not pruning runs.');

const objects = await r2ListObjects(RUN_PREFIX);
const byRun = new Map<string, { keys: string[]; bytes: number; newest: number }>();
for (const obj of objects) {
  const id = runIdOfKey(obj.key);
  if (!id) continue; // anything not inside atlas/runs/<run id>/ is never ours to touch
  const run = byRun.get(id) ?? { keys: [], bytes: 0, newest: 0 };
  run.keys.push(obj.key);
  run.bytes += obj.size ?? 0;
  run.newest = Math.max(run.newest, obj.lastModified?.getTime() ?? 0);
  byRun.set(id, run);
}

const plan = planRunsPrune({ runs: [...byRun].map(([id, r]) => ({ id, newest: r.newest })), kept });
const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
console.log(`Runs prune: live ${liveId}; kept releases ${releasePlan.keep.join(', ')}.`);
for (const { id, why } of plan.keep) console.log(`  keep    ${id} (${day(byRun.get(id)!.newest)}, ${gb(byRun.get(id)!.bytes)}): ${why}`);
for (const id of plan.delete) console.log(`  ${apply ? 'delete ' : 'would delete'} ${id} (${day(byRun.get(id)!.newest)}, ${byRun.get(id)!.keys.length} files, ${gb(byRun.get(id)!.bytes)})`);
const keys = plan.delete.flatMap(id => byRun.get(id)!.keys);
assertDeletableRunKeys(keys, plan);
const total = plan.delete.reduce((sum, id) => sum + byRun.get(id)!.bytes, 0);
if (!apply || keys.length === 0) {
  console.log(apply ? '  Nothing to prune.' : `  Dry run: ${plan.delete.length} runs, ${keys.length} files, ${gb(total)} would be deleted. Nothing deleted.`);
} else {
  const deleted = await r2DeleteKeys(keys);
  console.log(`  Deleted ${deleted} files (${gb(total)}) from ${plan.delete.length} runs.`);
}
