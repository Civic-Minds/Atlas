/**
 * loadEnv.ts — load pipeline env from .env.local (default) or staging.
 *
 *   ATLAS_ENV=staging          → .env.staging
 *   ATLAS_ENV_FILE=path        → that file (wins over ATLAS_ENV)
 *   (default)                  → .env.local
 *
 * Import this module first in pipeline CLIs so `shared/config` sees the right
 * R2_PUBLIC_URL when its module body evaluates.
 *
 * Staging is a dress-rehearsal of prod (same key layout, different bucket).
 */
import { existsSync } from 'fs';
import { config } from 'dotenv';
import { resolve } from 'path';
import { stagingBucketProblem, stagingRequested } from './stagingGuard.js';

export function resolvePipelineEnvFile(): string {
  if (process.env.ATLAS_ENV_FILE) return process.env.ATLAS_ENV_FILE;
  if (stagingRequested(process.env.ATLAS_ENV)) return '.env.staging';
  return '.env.local';
}

/**
 * Why a requested staging run must not go ahead, or null. Staging is asked for by ATLAS_ENV=staging or a
 * .env.staging file. A missing file loads nothing, and an unset R2_BUCKET_NAME means the production
 * bucket, so a "staging" run in a worktree (which has no .env.staging) or one where the shell already
 * exports the production bucket (dotenv never overrides it) would read and write production (#1129).
 */
export function stagingEnvProblem(opts: { file: string; atlasEnv?: string; fileExists: boolean; bucket?: string }): string | null {
  const staging = stagingRequested(opts.atlasEnv) || /(^|[\\/])\.env\.staging$/.test(opts.file);
  if (!staging) return null;
  if (!opts.fileExists) return `${opts.file} is missing, so a staging run would use the production bucket`;
  const problem = stagingBucketProblem(opts.bucket, 'staging');
  return problem ? `${opts.file} is loaded, but ${problem}` : null;
}

/** An explicit ATLAS_ENV_FILE that does not exist is refused, rather than loading nothing. */
export function envFileProblem(envFile: string | undefined, fileExists: boolean): string | null {
  return envFile && !fileExists ? `ATLAS_ENV_FILE ${envFile} does not exist` : null;
}

/** The R2 write keys: a dry run never has them (#1587). */
export const R2_WRITE_ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;

/** What a dry run reports as its env instead of a file: nothing was loaded. */
export const DRY_RUN_ENV_LABEL = 'none loaded (--dry-run) [DRY RUN]';

/**
 * Scripts whose --dry-run never touches R2, so it loads no env file and drops any R2 write keys the shell exports:
 * a dry run can't upload or report the production bucket (#1587). Other CLIs' --dry-run flags keep loading the file.
 */
const DRY_RUN_WITHOUT_ENV = new Set(['process-gtfs.ts', 'process-gtfs.js']);

export function dryRunWithoutEnv(argv: readonly string[] = process.argv): boolean {
  const script = (argv[1] ?? '').split(/[\\/]/).pop() ?? '';
  return DRY_RUN_WITHOUT_ENV.has(script) && argv.slice(2).includes('--dry-run');
}

/** Load env file into process.env. Returns the path used. Refuses a staging run that would reach production. A dry run loads none. */
export function loadPipelineEnv(opts: { dryRun?: boolean } = {}): string {
  if (opts.dryRun) {
    for (const key of R2_WRITE_ENV_KEYS) delete process.env[key];
    return DRY_RUN_ENV_LABEL;
  }
  const file = resolvePipelineEnvFile();
  const path = resolve(file);
  const fileExists = existsSync(path);
  const missing = envFileProblem(process.env.ATLAS_ENV_FILE, fileExists);
  if (missing) throw new Error(missing);
  config({ path, quiet: true });
  const problem = stagingEnvProblem({ file, atlasEnv: process.env.ATLAS_ENV, fileExists, bucket: process.env.R2_BUCKET_NAME });
  if (problem) throw new Error(`Refusing a staging run: ${problem}.`);
  return file;
}

// Side-effect: load on import so later imports of shared/config see staging/prod correctly.
const _loaded = loadPipelineEnv({ dryRun: dryRunWithoutEnv() });
export const LOADED_ENV_FILE = _loaded;

/**
 * Production public bucket is `atlas`. Staging/other buckets are dress-rehearsal
 * targets — country-launch hard gate does not apply there.
 */
export function isProductionPublicR2Bucket(): boolean {
  if (LOADED_ENV_FILE === DRY_RUN_ENV_LABEL) return false;
  const bucket = (process.env.R2_BUCKET_NAME ?? 'atlas').replace(/^["']|["']$/g, '');
  return bucket === 'atlas';
}
