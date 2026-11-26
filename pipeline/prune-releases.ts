/**
 * Delete old data releases, keeping the live one plus the previous two.
 *   npx tsx pipeline/prune-releases.ts --dry-run   (lists what would be deleted)
 *   npx tsx pipeline/prune-releases.ts             (deletes)
 */
import './loadEnv.js';
import { pruneOldReleases } from './pruneReleases.js';
import { assertKnownFlags } from './cliFlags.js';

assertKnownFlags(process.argv.slice(2), { '--dry-run': 'flag' }); // CIV-3017: a mistyped flag must not turn into a real write
await pruneOldReleases({ dryRun: process.argv.includes('--dry-run') });
