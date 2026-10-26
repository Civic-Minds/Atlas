import { afterEach, describe, expect, it, vi } from 'vitest';

// Features that used to read FEATURES.beta ("any non-public build") because they had no flag of
// their own. Each now has a named flag so it can graduate alone, and each must give exactly what
// FEATURES.beta gave in every build until someone changes it on purpose.
const STAND_IN_FLAGS = [
  'persistedSettings',
  'updateBanner',
  'mapContext',
  'matchPercentage',
  'feedQuality',
  'outdatedFilter',
  'whatsNewBetaItems',
  'routeVariants',
  'runningTimes',
  'sparklineExpand',
] as const;

async function configFor(env: Record<string, string>, dev: boolean) {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  for (const key of ['VITE_ATLAS_MODE', 'VITE_BETA_BUILD', 'VITE_PREVIEW_BUILD']) vi.stubEnv(key, env[key] ?? '');
  return (await import('../../shared/config')).FEATURES as Record<string, unknown>;
}

// The legacy VITE_BETA_BUILD / VITE_PREVIEW_BUILD flags are not covered: vitest does not feed stubbed values
// to the optional-chained env read in envFlag, so they cannot be exercised here.
const BUILDS: Array<{ name: string; env: Record<string, string>; dev: boolean; beta: boolean }> = [
  { name: 'public', env: { VITE_ATLAS_MODE: 'public' }, dev: false, beta: false },
  { name: 'preview', env: { VITE_ATLAS_MODE: 'preview' }, dev: false, beta: true },
  { name: 'beta', env: { VITE_ATLAS_MODE: 'beta' }, dev: false, beta: true },
  { name: 'dev', env: { VITE_ATLAS_MODE: 'dev' }, dev: true, beta: true },
  { name: 'legacy public (no mode set)', env: {}, dev: false, beta: false },
  { name: 'vite dev server', env: {}, dev: true, beta: true },
];

describe('named flags that stand in for FEATURES.beta', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  for (const build of BUILDS) {
    it(`${build.name}: FEATURES.beta is ${build.beta} and every stand-in flag matches it`, async () => {
      const features = await configFor(build.env, build.dev);
      expect(features.beta).toBe(build.beta);
      for (const flag of STAND_IN_FLAGS) expect([flag, features[flag]]).toEqual([flag, build.beta]);
    });
  }
});
