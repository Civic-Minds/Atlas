/**
 * One-off: build atlas/release-history.json from the immutable release manifests
 * (atlas/releases/<id>/manifest.json) still in R2. Reads only, unless --write is passed.
 *   npx tsx pipeline/backfill-release-history.ts          (prints what it would write)
 *   npx tsx pipeline/backfill-release-history.ts --write  (merges into the existing history)
 * Releases whose manifests were deleted cannot be recovered.
 */
import './loadEnv.js';
import { r2Get, r2List, r2Put } from './r2.js';
import { RELEASE_HISTORY_KEY, appendReleaseHistory } from '../shared/releaseHistory.js';

const write = process.argv.includes('--write');
const keys = (await r2List('atlas/releases/')).filter(key => /^atlas\/releases\/release-[a-z0-9]+\/manifest\.json$/.test(key));
const found: Array<{ releaseId?: string; generatedAt?: string }> = [];
for (const key of keys) {
  const raw = await r2Get(key);
  if (!raw) continue;
  try {
    const manifest = JSON.parse(raw) as { releaseId?: string; generatedAt?: string };
    found.push({ releaseId: manifest.releaseId, generatedAt: manifest.generatedAt });
  } catch {
    console.warn(`Skipping unreadable ${key}`);
  }
}
let existing: unknown = [];
const existingRaw = await r2Get(RELEASE_HISTORY_KEY);
if (existingRaw) existing = JSON.parse(existingRaw);
const merged = appendReleaseHistory(existing, ...found);
console.log(`${keys.length} manifests found, ${merged.length} history entries.`);
console.log(JSON.stringify(merged, null, 2));
if (write) {
  await r2Put(RELEASE_HISTORY_KEY, JSON.stringify(merged, null, 2));
  console.log(`Wrote ${RELEASE_HISTORY_KEY}.`);
} else {
  console.log('Dry run; pass --write to upload.');
}
