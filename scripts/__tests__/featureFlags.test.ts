import { describe, expect, it } from 'vitest';
import { devScriptEnv, featuresForEnv, pickSwitches } from '../featureFlags';
import { renderTable } from '../print-flags';

describe('npm run flags (CIV-1402)', () => {
  it('computes FEATURES with shared/config.ts for a given env', async () => {
    const pub = await featuresForEnv({ VITE_ATLAS_MODE: 'public', PROD: true, DEV: false });
    expect(pub.mode).toBe('public');
    expect(pub.features).toMatchObject({ beta: false, history: false, liveReports: false, mapExport: true });
    const beta = await featuresForEnv({ VITE_ATLAS_MODE: 'beta', VITE_HISTORY_ENABLED: 'true', VITE_LIVE_REPORTS_ENABLED: 'true', PROD: true, DEV: false });
    expect(beta.features).toMatchObject({ beta: true, history: true, liveReports: true, live: false });
  });

  it('reads a dev script\'s env, and fails loudly for a missing script', async () => {
    const env = devScriptEnv('dev:beta');
    expect(env.VITE_ATLAS_MODE).toBe('beta');
    expect((await featuresForEnv(env)).features.history).toBe(true);
    expect(() => devScriptEnv('dev:nope')).toThrow(/no "dev:nope" script/);
  });

  it('keeps only switches, never URLs or keys', () => {
    expect(pickSwitches({ VITE_ATLAS_MODE: 'beta', VITE_HISTORY_ENABLED: 'true', VITE_R2_PUBLIC_URL: 'https://x', VITE_BETA_BUILD: 'true', VITE_EMPTY_ENABLED: '' }))
      .toEqual({ VITE_ATLAS_MODE: 'beta', VITE_BETA_BUILD: 'true', VITE_HISTORY_ENABLED: 'true' });
  });

  it('prints one row per feature, ? for a site it could not read', () => {
    const out = renderTable([
      { name: 'public', error: 'no flags.json yet (deploy predates it)' },
      { name: 'beta', flags: { mode: 'beta', features: { history: true, live: false }, switches: {}, commit: 'abcdef123' } },
    ]);
    expect(out).toMatch(/^mode\s+\?\s+beta$/m);
    expect(out).toMatch(/^commit\s+abcdef1$/m);
    expect(out).toMatch(/^history\s+\?\s+on$/m);
    expect(out).toMatch(/^live\s+\?\s+off$/m);
    expect(out).toContain('public: no flags.json yet');
  });
});
