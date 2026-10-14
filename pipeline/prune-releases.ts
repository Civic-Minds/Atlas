/**
 * Delete old data releases, keeping the live one plus the previous two.
 *   npx tsx pipeline/prune-releases.ts --dry-run   (lists what would be deleted)
 *   npx tsx pipeline/prune-releases.ts             (deletes)
 */
import './loadEnv.js';
import { pruneOldReleases } from './pruneReleases.js';

await pruneOldReleases({ dryRun: process.argv.includes('--dry-run') });
