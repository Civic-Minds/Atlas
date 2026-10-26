#!/usr/bin/env npx tsx
/**
 * Put a named backup (see history-config-backup.ts) back as the PUBLIC atlas/history-config.json.
 *
 *   npm run history:restore -- --from 20261021-101500            dry run (default)
 *   ATLAS_HISTORY_V2=1 npm run history:restore -- --from 20261021-101500 --write
 *
 * --from accepts the stamp (YYYYMMDD-HHMMSS), `backup-<stamp>`, `pre-restore-<stamp>` or the full key.
 * Shows a diff summary (sizes, sha256, agency counts, which agencies differ). On --write it first makes
 * an automatic verified backup of the CURRENT file (atlas/history-config.pre-restore-<stamp>.json + manifest),
 * then writes the backup's exact bytes to atlas/history-config.json and reads them back.
 * The backup is checked against its manifest (size + sha256) before anything is written.
 * The dry run reads the bucket only when credentials are configured; otherwise it prints the plan.
 * Restoring does not touch shared/data/history-agencies.json: revert that with git.
 */
import {
  HISTORY_CONFIG_KEY, assertWriteGate, backupKeyFor, byteLength, currentGitCommit, describePlan, hasR2Credentials,
  isEntryPoint, manifestKeyFor, parseFlags, planBackup, publicBucketIO, readAgencyListSummary, sha256, writeBackup,
  type BackupDeps, type BackupManifest, type BucketIO, type Env,
} from './historyPublishLib.js';

/** Resolve --from to a backup key, or throw for a name that is not one. */
export function resolveBackupKey(name: string): string {
  const m = /^(?:atlas\/history-config\.)?(?:(backup|pre-restore)-)?(\d{8}-\d{6})(?:\.json)?$/.exec(name);
  if (!m) throw new Error(`unknown backup name "${name}": use a stamp like 20261021-101500, backup-<stamp>, pre-restore-<stamp> or the full atlas/history-config.backup-<stamp>.json key`);
  return backupKeyFor((m[1] as 'backup' | 'pre-restore' | undefined) ?? 'backup', m[2]);
}

export interface ConfigDiff {
  currentAgencies: number;
  backupAgencies: number;
  onlyInBackup: string[];
  onlyInCurrent: string[];
  changed: string[];
}

function bySlug(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const v: unknown = JSON.parse(body);
  if (!Array.isArray(v)) throw new Error('history-config.json is not an array');
  for (const a of v as Array<{ slug?: string }>) out.set(String(a.slug), JSON.stringify(a));
  return out;
}

export function diffConfigs(currentBody: string | null, backupBody: string): ConfigDiff {
  const cur = currentBody ? bySlug(currentBody) : new Map<string, string>();
  const bak = bySlug(backupBody);
  return {
    currentAgencies: cur.size,
    backupAgencies: bak.size,
    onlyInBackup: [...bak.keys()].filter(s => !cur.has(s)).sort(),
    onlyInCurrent: [...cur.keys()].filter(s => !bak.has(s)).sort(),
    changed: [...bak.keys()].filter(s => cur.has(s) && cur.get(s) !== bak.get(s)).sort(),
  };
}

export interface RestoreRunOptions {
  argv: string[];
  env: Env;
  now?: Date;
  log?: (line: string) => void;
  makeIO?: () => Promise<BucketIO>;
  gitCommit?: () => string;
  agencyList?: BackupDeps['agencyList'];
}

export async function runRestore(opts: RestoreRunOptions): Promise<number> {
  const log = opts.log ?? (l => console.log(l));
  const now = opts.now ?? new Date();
  const { values, bools } = parseFlags(opts.argv, ['--from'], ['--write']);
  const write = bools.has('--write');
  assertWriteGate(write, opts.env);
  if (!values['--from']) throw new Error('Usage: history-config-restore.ts --from <backup stamp or key> [--write]');
  const backupKey = resolveBackupKey(values['--from']);
  const manifestKey = manifestKeyFor(backupKey);

  if (!write && !opts.makeIO && !hasR2Credentials(opts.env, 'R2_BUCKET_NAME')) {
    log('DRY RUN (remote state unknown: no credentials; dry-run reads skipped)');
    log(`  would read   ${backupKey} and ${manifestKey} (checked against each other)`);
    log(`  would read   ${HISTORY_CONFIG_KEY} (current) and print a diff summary`);
    log(`  would write  atlas/history-config.pre-restore-<stamp>.json + .manifest.json (automatic backup of the current file)`);
    log(`  would write  ${HISTORY_CONFIG_KEY}  (OVERWRITE with the backup)`);
    return 0;
  }

  const io = await (opts.makeIO ?? publicBucketIO)();
  const [bak, man] = [await io.get(backupKey), await io.get(manifestKey)];
  if (!bak) { log(`unknown backup: ${backupKey} does not exist in the public bucket.`); return 1; }
  if (!man) { log(`refusing: ${manifestKey} is missing, so ${backupKey} cannot be verified.`); return 1; }
  let manifest: BackupManifest;
  try { manifest = JSON.parse(man.body) as BackupManifest; } catch { log(`refusing: ${manifestKey} is not valid JSON.`); return 1; }
  const bakSha = sha256(bak.body);
  const bakSize = byteLength(bak.body);
  if (manifest.sha256 !== bakSha || manifest.sizeBytes !== bakSize) {
    log(`refusing: ${backupKey} does not match its manifest (manifest ${manifest.sizeBytes} bytes sha256 ${manifest.sha256}; object ${bakSize} bytes sha256 ${bakSha}).`);
    return 1;
  }

  const deps: BackupDeps = {
    io, now, kind: 'pre-restore',
    gitCommit: (opts.gitCommit ?? currentGitCommit)(),
    agencyList: opts.agencyList !== undefined ? opts.agencyList : readAgencyListSummary(),
  };
  const planned = await planBackup(deps); // reads the current file
  const currentBody = planned ? planned.body : null;
  const diff = diffConfigs(currentBody, bak.body);

  log(write ? 'WRITE: about to restore history-config.json from a backup' : 'DRY RUN (nothing will be written)');
  log(`  backup   ${backupKey}  ${bakSize} bytes  sha256 ${bakSha}  ${diff.backupAgencies} agencies  (created ${manifest.createdAt}, commit ${manifest.gitCommit})`);
  log(`  current  ${HISTORY_CONFIG_KEY}  ${currentBody == null ? 'MISSING' : `${byteLength(currentBody)} bytes  sha256 ${sha256(currentBody)}  ${diff.currentAgencies} agencies`}`);
  log(`  only in backup (${diff.onlyInBackup.length}): ${diff.onlyInBackup.join(', ') || '-'}`);
  log(`  only in current (${diff.onlyInCurrent.length}): ${diff.onlyInCurrent.join(', ') || '-'}`);
  log(`  differ (${diff.changed.length}): ${diff.changed.join(', ') || '-'}`);
  if (currentBody != null && sha256(currentBody) === bakSha) {
    log('The current file already equals this backup: nothing to restore.');
    return 0;
  }
  if (planned) { log('  automatic backup of the current file first:'); for (const l of describePlan(planned.plan)) log(l); }
  else log('  no current file, so no pre-restore backup is needed.');
  log(`  write  ${HISTORY_CONFIG_KEY}  (OVERWRITE with the backup's exact bytes)`);
  if (!write) {
    log('Re-run with --write (and ATLAS_HISTORY_V2=1) to restore.');
    return 0;
  }

  try {
    if (planned) {
      const pre = await writeBackup(deps, planned);
      log(`Pre-restore backup verified: ${pre.backupKey}`);
    }
    await io.put(HISTORY_CONFIG_KEY, bak.body);
    const back = await io.get(HISTORY_CONFIG_KEY);
    if (!back || sha256(back.body) !== bakSha || byteLength(back.body) !== bakSize) {
      log(`RESTORE UNVERIFIED: ${HISTORY_CONFIG_KEY} did not read back as the backup. ${planned ? `The previous file is at ${planned.plan.backupKey}.` : ''}`);
      return 1;
    }
    log(`Restored ${HISTORY_CONFIG_KEY} from ${backupKey} (verified). Revert shared/data/history-agencies.json with git if it was changed.`);
    return 0;
  } catch (err) {
    log(`RESTORE FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  (async () => {
    await import('./loadEnv.js');
    process.exitCode = await runRestore({ argv: process.argv.slice(2), env: process.env });
  })().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
