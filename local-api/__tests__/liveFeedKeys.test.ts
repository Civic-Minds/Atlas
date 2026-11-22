import { describe, expect, it } from 'vitest';
import { fillLiveFeedKeys, liveFeedKeyNames } from '../liveFeedKeys';

// CIV-2072: the dev server copies only the Live feed keys from the main checkout's .env.local, never storage keys.
describe('Live feed keys for the local API', () => {
  it('lists the keys Live config names, and never an R2 key', () => {
    const names = liveFeedKeyNames();
    expect(names).toContain('MUNI_511_API_KEY');
    expect(names.some(n => n.startsWith('R2_'))).toBe(false);
  });

  it('cannot include an R2 key even when the config names one', () => {
    expect(liveFeedKeyNames([{ apiKeyParamEnvVar: 'R2_SECRET_ACCESS_KEY' }, { apiKeyHeaderEnvVar: 'R2_ACCESS_KEY_ID' }, { apiKeyParamEnvVar: 'FOO_API_KEY' }]))
      .toEqual(['FOO_API_KEY']);
  });

  it('copies only allowed names the process lacks, and reports the ones set nowhere', () => {
    const env: NodeJS.ProcessEnv = { STM_API_KEY: 'mine' };
    const source = { STM_API_KEY: 'main', MUNI_511_API_KEY: 'muni', R2_SECRET_ACCESS_KEY: 'secret', OTHER: 'x' };
    const { copied, missing } = fillLiveFeedKeys(env, source, ['STM_API_KEY', 'MUNI_511_API_KEY', 'SWIFTLY_API_KEY', 'R2_SECRET_ACCESS_KEY']);
    expect(copied).toEqual(['MUNI_511_API_KEY']);
    expect(missing).toEqual(['SWIFTLY_API_KEY']);
    expect(env).toEqual({ STM_API_KEY: 'mine', MUNI_511_API_KEY: 'muni' });
  });
});
