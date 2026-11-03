import { describe, expect, it } from 'vitest';
import { stagingEnvProblem } from '../loadEnv.js';

describe('stagingEnvProblem (#1129)', () => {
  it('refuses a staging run whose env file is missing (a worktree)', () => {
    expect(stagingEnvProblem({ file: '.env.staging', atlasEnv: 'staging', fileExists: false })).toMatch(/missing/);
  });

  it('refuses a staging run that would still use the production bucket', () => {
    expect(stagingEnvProblem({ file: '.env.staging', atlasEnv: 'staging', fileExists: true, bucket: 'atlas' })).toMatch(/production bucket/);
    expect(stagingEnvProblem({ file: '.env.staging', atlasEnv: 'staging', fileExists: true })).toMatch(/unset/);
    expect(stagingEnvProblem({ file: '/x/.env.staging', fileExists: true, bucket: '"atlas"' })).toMatch(/production bucket/);
  });

  it('accepts staging on the staging bucket, and never checks a production run', () => {
    expect(stagingEnvProblem({ file: '.env.staging', atlasEnv: 'staging', fileExists: true, bucket: 'atlas-staging' })).toBeNull();
    expect(stagingEnvProblem({ file: '.env.local', fileExists: false })).toBeNull();
    expect(stagingEnvProblem({ file: '.env.local', fileExists: true, bucket: 'atlas' })).toBeNull();
  });
});

describe('staging guard in r2 and loadEnv (#1129)', () => {
  it('matches ATLAS_ENV in any case', async () => {
    const { stagingRequested, stagingBucketProblem } = await import('../stagingGuard.js');
    expect(stagingRequested('Staging')).toBe(true);
    expect(stagingRequested(' STAGING ')).toBe(true);
    expect(stagingRequested(undefined)).toBe(false);
    expect(stagingBucketProblem('atlas', 'Staging')).toMatch(/production bucket/);
    expect(stagingBucketProblem('atlas', undefined)).toBeNull();
    expect(stagingBucketProblem('atlas-staging', 'staging')).toBeNull();
    expect(stagingEnvProblem({ file: '.env.staging', atlasEnv: 'Staging', fileExists: false })).toMatch(/missing/);
  });

  it('refuses a missing ATLAS_ENV_FILE', async () => {
    const { envFileProblem } = await import('../loadEnv.js');
    expect(envFileProblem('/nope/.env.custom', false)).toMatch(/does not exist/);
    expect(envFileProblem('/x/.env.custom', true)).toBeNull();
    expect(envFileProblem(undefined, false)).toBeNull();
  });

  it('r2 refuses the production bucket under ATLAS_ENV=staging, for scripts that load .env.local themselves', async () => {
    const { publicBucketName } = await import('../r2.js');
    const saved = { env: process.env.ATLAS_ENV, bucket: process.env.R2_BUCKET_NAME };
    try {
      process.env.R2_BUCKET_NAME = 'atlas';
      process.env.ATLAS_ENV = 'staging';
      expect(() => publicBucketName()).toThrow(/Refusing a staging run/);
      process.env.R2_BUCKET_NAME = 'atlas-staging';
      expect(publicBucketName()).toBe('atlas-staging');
      delete process.env.ATLAS_ENV;
      process.env.R2_BUCKET_NAME = 'atlas';
      expect(publicBucketName()).toBe('atlas');
    } finally {
      if (saved.env === undefined) delete process.env.ATLAS_ENV; else process.env.ATLAS_ENV = saved.env;
      if (saved.bucket === undefined) delete process.env.R2_BUCKET_NAME; else process.env.R2_BUCKET_NAME = saved.bucket;
    }
  });
});
