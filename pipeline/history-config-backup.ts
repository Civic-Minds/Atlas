#!/usr/bin/env npx tsx
/**
 * Back up the PUBLIC bucket's atlas/history-config.json to an immutable dated key before a
 * History v2 publish (docs/data/DATA_HISTORY.md "Publishing History v2 (runbook)").
 *
 *   npm run history:backup                 dry run (default): prints what would be read and written
 *   ATLAS_HISTORY_V2=1 npm run history:backup -- --write
 *
 * Writes atlas/history-config.backup-YYYYMMDD-HHMMSS.json (an exact copy) and
 * atlas/history-config.backup-YYYYMMDD-HHMMSS.manifest.json
 * {sourceKey, backupKey, sizeBytes, sha256, etag?, createdAt, agencyCount, gitCommit, agencyList}.
 * Refuses to overwrite an existing backup key, reads the copy back (size + sha256) and only then
 * writes the manifest. The dry run reads the public bucket only when R2 credentials are configured
 * (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME); otherwise it prints the
 * plan from the key names alone. Nothing on any default path calls this.
 */
import {
  HISTORY_CONFIG_KEY, assertWriteGate, backupKeyFor, currentGitCommit, describePlan, hasR2Credentials,
  isEntryPoint, manifestKeyFor, parseFlags, planBackup, publicBucketIO, readAgencyListSummary, stampOf,
  writeBackup, type BackupDeps, type BucketIO, type Env,
} from './historyPublishLib.js';

export interface BackupRunOptions {
  argv: string[];
  env: Env;
  now?: Date;
  log?: (line: string) => void;
  /** Injected in tests; the real factory only runs on --write or a credentialed dry run. */
  makeIO?: () => Promise<BucketIO>;
  gitCommit?: () => string;
  agencyList?: BackupDeps['agencyList'];
}

/** Returns the process exit code. */
export async function runBackup(opts: BackupRunOptions): Promise<number> {
  const log = opts.log ?? (l => console.log(l));
  const now = opts.now ?? new Date();
  const { bools } = parseFlags(opts.argv, [], ['--write']);
  const write = bools.has('--write');
  assertWriteGate(write, opts.env);
  const makeIO = opts.makeIO ?? publicBucketIO;
  const stamp = stampOf(now);
  const backupKey = backupKeyFor('backup', stamp);

  if (!write && !opts.makeIO && !hasR2Credentials(opts.env, 'R2_BUCKET_NAME')) {
    log('DRY RUN (remote state unknown: no credentials; dry-run reads skipped)');
    log(`  would read   ${HISTORY_CONFIG_KEY}`);
    log(`  would write  ${backupKey}  (new if the key is free; refuses if it exists)`);
    log(`  would write  ${manifestKeyFor(backupKey)}  (after a verified read-back)`);
    log('Nothing was read or written. Re-run with --write (and ATLAS_HISTORY_V2=1) to publish.');
    return 0;
  }

  const io = await makeIO();
  const deps: BackupDeps = {
    io, now, stamp,
    gitCommit: (opts.gitCommit ?? currentGitCommit)(),
    agencyList: opts.agencyList !== undefined ? opts.agencyList : readAgencyListSummary(),
  };
  const planned = await planBackup(deps);
  if (!planned) {
    log(`${HISTORY_CONFIG_KEY} does not exist in the public bucket: nothing to back up.`);
    return 1;
  }
  log(write ? 'WRITE: about to back up the live history-config.json' : 'DRY RUN (nothing will be written)');
  for (const l of describePlan(planned.plan)) log(l);
  if (!write) {
    log('Re-run with --write (and ATLAS_HISTORY_V2=1) to write the backup.');
    return planned.plan.backupKeyState === 'exists' || planned.plan.manifestKeyState === 'exists' ? 1 : 0;
  }
  try {
    const manifest = await writeBackup(deps, planned);
    log(`Backup verified (${manifest.sizeBytes} bytes, sha256 ${manifest.sha256}). Manifest written to ${planned.plan.manifestKey}.`);
    log(`Restore with: ATLAS_HISTORY_V2=1 npm run history:restore -- --from ${stamp} --write`);
    return 0;
  } catch (err) {
    log(`BACKUP FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  (async () => {
    await import('./loadEnv.js'); // .env.local, same as the other pipeline CLIs (key-free in a worktree)
    process.exitCode = await runBackup({ argv: process.argv.slice(2), env: process.env });
  })().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
