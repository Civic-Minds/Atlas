/**
 * Promote a published rebuild's agency files to top-level (CIV-522).
 *
 *   npx tsx pipeline/promote-run-artifacts.ts --run-prefix atlas/runs/<run id>
 *
 * Run only after publish-data-release has made the release built from that prefix public: it copies
 * every file the run staged under the prefix to `atlas/<name>.json`, the copies local dev and
 * beta-only agencies read, then bumps the public data version. Safe to run again after a failure.
 * Writes to R2, like every publish step.
 */
import './loadEnv.js';
import { r2Get, r2List, r2Put } from './r2.js';
import { bumpPublicDataVersion } from './dataVersion.js';
import { runWithConcurrency } from './utils.js';
import { parseRunPrefixArg, promoteRunArtifacts } from './runArtifacts.js';

const prefix = parseRunPrefixArg(process.argv.slice(2), '--run-prefix');
if (!prefix) throw new Error('--run-prefix atlas/runs/<run id> is required.');

const { promoted, skipped } = await promoteRunArtifacts(prefix, {
  list: r2List,
  get: r2Get,
  put: async (key, body) => { await r2Put(key, body); },
}, async tasks => { await runWithConcurrency(tasks, 16); });
for (const key of skipped) console.warn(`  left in place (not an agency file): ${key}`);
if (promoted === 0) {
  // Every agency was refused, or the run predates staging: the top-level files already match.
  console.warn(`Nothing staged under ${prefix}/; top-level files unchanged.`);
} else {
  console.log(`Promoted ${promoted} files from ${prefix}/ to top-level.`);
  await bumpPublicDataVersion(`promote ${prefix}`);
}
