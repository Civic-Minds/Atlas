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
import { config } from 'dotenv';
import { resolve } from 'path';

export function resolvePipelineEnvFile(): string {
  if (process.env.ATLAS_ENV_FILE) return process.env.ATLAS_ENV_FILE;
  if (process.env.ATLAS_ENV === 'staging') return '.env.staging';
  return '.env.local';
}

/** Load env file into process.env. Returns the path used. */
export function loadPipelineEnv(): string {
  const file = resolvePipelineEnvFile();
  config({ path: resolve(file), quiet: true });
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
