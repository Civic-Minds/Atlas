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
