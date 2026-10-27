/**
 * Roll the public data release pointer back to an earlier release (CIV-521).
 *
 *   npx tsx pipeline/rollback-data-release.ts --to release-mvf8jscd            (dry run: prints the plan, writes nothing)
 *   npx tsx pipeline/rollback-data-release.ts --from-file tmp/before-release.json
 *   npx tsx pipeline/rollback-data-release.ts --to release-mvf8jscd --apply    (writes; needs Ryan's go, like any R2 write)
 *
 * A dry run is the default and reads only public URLs, so it needs no R2 keys. With --apply it writes the
 * target's manifest to atlas/release.json, then bumps atlas/data-version.json (bumpPublicDataVersion) so
 * browsers drop cached agency files. Nothing under atlas/releases/ is deleted, the per-agency top-level
 * files are not touched, and atlas/release-history.json is left as it is.
 *
 * It refuses when the target's files are gone (prune keeps the live release plus the previous ones), when
 * the target was built for another route schema or tile rules than this code, when it is already public,
 * or when it is newer than the public release (a forward move goes through publish-data-release).
 * Every agency in the public catalog (public/data/index.json) must still have its file in the target.
 */
import fs from 'fs';
import './loadEnv.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { RELEASE_HISTORY_KEY, parseReleaseHistory } from '../shared/releaseHistory.js';
import { publicCatalogSlugs, releaseFileExists, releasePrefixOf, type ReleaseManifest } from './releaseGuard.js';
import { planRollback, rollbackFileKeys, RELEASE_POINTER_KEY } from './releaseRollback.js';
import { runWithConcurrency } from './utils.js';

const argv = process.argv.slice(2);
const argValue = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const apply = argv.includes('--apply');
const toId = argValue('--to');
const fromFile = argValue('--from-file');
if (!toId === !fromFile) {
  throw new Error('Name the release to restore: --to <releaseId> or --from-file <saved release.json>.');
}

const base = R2_PUBLIC_URL.replace(/\/$/, '');
const bust = `v=${Date.now().toString(36)}`;
async function fetchJson(key: string): Promise<unknown> {
  const response = await fetch(`${base}/${key}?${bust}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${key}: HTTP ${response.status}`);
  return await response.json();
}

const target = (fromFile
  ? JSON.parse(fs.readFileSync(fromFile, 'utf8'))
  : await fetchJson(`${releasePrefixOf({ releaseId: toId! })}/manifest.json`)) as Partial<ReleaseManifest> | null;
const targetSource = fromFile ? fromFile : `atlas/releases/${toId}/manifest.json`;
const current = await fetchJson(RELEASE_POINTER_KEY) as Partial<ReleaseManifest> | null;
const history = await fetchJson(RELEASE_HISTORY_KEY).catch(() => null);

const indexAgencies = (JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')) as { agencies?: Array<Record<string, unknown>> }).agencies ?? [];
const keys = target?.releaseId && target.agencyPrefix && target.pmtilesKey && target.overviewPmtilesKey
  ? rollbackFileKeys(target as ReleaseManifest, publicCatalogSlugs(indexAgencies))
  : [];
console.log(`Checking ${keys.length} files of ${target?.releaseId ?? 'the target'} in ${base}...`);
const files = await runWithConcurrency(
  keys.map(key => async () => ({ key, exists: await releaseFileExists(`${base}/${key}?${bust}`) })),
  6,
);

const plan = planRollback({
  target,
  targetSource,
  current,
  files,
  historyIds: parseReleaseHistory(history).map(entry => entry.releaseId),
});

console.log(`\nPublic now: ${current?.releaseId ?? 'unknown'} (generated ${current?.generatedAt ?? '?'})`);
console.log(`Target:     ${target?.releaseId ?? 'unknown'} (generated ${target?.generatedAt ?? '?'}) from ${targetSource}`);
for (const warning of plan.warnings) console.warn(`Warning: ${warning}`);
for (const error of plan.errors) console.error(`Problem: ${error}`);
console.log(`\n${plan.summary}`);
if (plan.errors.length) process.exit(1);

if (!apply) {
  console.log('\nDry run: nothing was written. Writes with --apply:');
  for (const write of plan.writes) console.log(`  ${write.key} ← ${target!.releaseId} manifest (${write.body.length} bytes)`);
  console.log('  atlas/data-version.json ← a new stamp');
  process.exit(0);
}

// Only an --apply run loads the write helpers (and so needs R2 keys).
const { r2Put } = await import('./r2.js');
const { bumpPublicDataVersion } = await import('./dataVersion.js');
for (const write of plan.writes) {
  await r2Put(write.key, write.body);
  console.log(`  ${write.key} → ${target!.releaseId}`);
}
await bumpPublicDataVersion(`rollback to ${target!.releaseId}`);
console.log(`Rolled the public data release back to ${target!.releaseId}.`);
