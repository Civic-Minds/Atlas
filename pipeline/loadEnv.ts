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

export function resolvePipelineEnvFile(): string {
  if (process.env.ATLAS_ENV_FILE) return process.env.ATLAS_ENV_FILE;
  if (process.env.ATLAS_ENV === 'staging') return '.env.staging';
  return '.env.local';
}

/**
 * Why a requested staging run must not go ahead, or null. Staging is asked for by ATLAS_ENV=staging or a
 * .env.staging file. A missing file loads nothing, and an unset R2_BUCKET_NAME means the production
 * bucket, so a "staging" run in a worktree (which has no .env.staging) or one where the shell already
 * exports the production bucket (dotenv never overrides it) would read and write production (#1129).
 */
export function stagingEnvProblem(opts: { file: string; atlasEnv?: string; fileExists: boolean; bucket?: string }): string | null {
  const staging = opts.atlasEnv === 'staging' || /(^|[\\/])\.env\.staging$/.test(opts.file);
  if (!staging) return null;
  if (!opts.fileExists) return `${opts.file} is missing, so a staging run would use the production bucket`;
  const bucket = (opts.bucket ?? '').replace(/^["']|["']$/g, '');
  if (!bucket || bucket === 'atlas') return `${opts.file} is loaded, but R2_BUCKET_NAME is ${bucket ? 'the production bucket "atlas"' : 'unset (the production bucket)'}`;
  return null;
}

/** Load env file into process.env. Returns the path used. Refuses a staging run that would reach production. */
export function loadPipelineEnv(): string {
  const file = resolvePipelineEnvFile();
  const path = resolve(file);
  const fileExists = existsSync(path);
  if (process.env.ATLAS_ENV_FILE && !fileExists) throw new Error(`ATLAS_ENV_FILE ${file} does not exist`);
  config({ path, quiet: true });
  const problem = stagingEnvProblem({ file, atlasEnv: process.env.ATLAS_ENV, fileExists, bucket: process.env.R2_BUCKET_NAME });
  if (problem) throw new Error(`Refusing a staging run: ${problem}.`);
  return file;
}

// Side-effect: load on import so later imports of shared/config see staging/prod correctly.
const _loaded = loadPipelineEnv();
export const LOADED_ENV_FILE = _loaded;

/**
 * Production public bucket is `atlas`. Staging/other buckets are dress-rehearsal
 * targets — country-launch hard gate does not apply there.
 */
export function isProductionPublicR2Bucket(): boolean {
  const bucket = (process.env.R2_BUCKET_NAME ?? 'atlas').replace(/^["']|["']$/g, '');
  return bucket === 'atlas';
}
