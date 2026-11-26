/**
 * Delete search index files (atlas/search/) that no release still in R2 names (CIV-1056).
 *   npx tsx pipeline/prune-search-index.ts           (dry run: lists what would be deleted)
 *   npx tsx pipeline/prune-search-index.ts --apply   (deletes; needs Ryan's go, like any R2 delete)
 */
import './loadEnv.js';
import { r2DeleteKeys, r2Get, r2ListObjects } from './r2.js';
import { pruneSearchIndex } from './searchPrune.js';
import { assertKnownFlags } from './cliFlags.js';

assertKnownFlags(process.argv.slice(2), { '--apply': 'flag' }); // CIV-3017: a mistyped flag must not turn into a real write
await pruneSearchIndex({ dryRun: !process.argv.includes('--apply') }, { getText: r2Get, listObjects: r2ListObjects, deleteKeys: r2DeleteKeys });
