/**
 * #1129: a run asked to use staging must never reach the production public bucket ("atlas").
 * Pure checks shared by loadEnv (the env file) and r2.ts (every public-bucket read and write), so
 * scripts that load .env.local themselves are covered too. Production runs (no ATLAS_ENV) are unchanged.
 */

/** Whether ATLAS_ENV asks for staging, in any case ("staging", "Staging"). */
export function stagingRequested(atlasEnv: string | undefined = process.env.ATLAS_ENV): boolean {
  return (atlasEnv ?? '').trim().toLowerCase() === 'staging';
}

/** The bucket name without surrounding quotes. */
export function bareBucket(bucket: string | undefined): string {
  return (bucket ?? '').replace(/^["']|["']$/g, '');
}

/** Why a staging run must not use this public bucket, or null. */
export function stagingBucketProblem(bucket: string | undefined, atlasEnv: string | undefined = process.env.ATLAS_ENV): string | null {
  if (!stagingRequested(atlasEnv)) return null;
  const name = bareBucket(bucket);
  if (!name) return 'R2_BUCKET_NAME is unset (the production bucket)';
  if (name === 'atlas') return 'R2_BUCKET_NAME is the production bucket "atlas"';
  return null;
}
