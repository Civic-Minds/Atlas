import { afterEach, describe, expect, it } from 'vitest';
import {
  isLiveApiServable,
  isLiveEligibleSlug,
  LIVE_POLLING_ROUTES,
} from '../livePollingConfig';

describe('isLiveEligibleSlug / isLiveApiServable', () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(saved)) delete saved[key];
  });

  function stashEnv(key: string) {
    if (!(key in saved)) saved[key] = process.env[key];
  }

  it('allows public-feed agencies without keys (burlington)', () => {
    expect(isLiveEligibleSlug('burlington')).toBe(true);
    expect(isLiveApiServable('burlington')).toBe(true);
  });

  it('rejects unknown slugs', () => {
    expect(isLiveEligibleSlug('not-a-real-agency')).toBe(false);
    expect(isLiveApiServable('not-a-real-agency')).toBe(false);
  });

  it('rejects parked key-gated agencies (lacmta active:false)', () => {
    expect(isLiveEligibleSlug('lacmta')).toBe(false);
    expect(isLiveApiServable('lacmta')).toBe(false);
  });

  it('rejects key-gated agencies that are not marked active', () => {
    // STM / TransLink require keys and only pass eligibility when active is set.
    const stm = LIVE_POLLING_ROUTES.find(r => r.slug === 'stm');
    expect(stm?.apiKeyHeaderEnvVar || stm?.apiKeyParamEnvVar).toBeTruthy();
    if (!stm?.active) {
      expect(isLiveEligibleSlug('stm')).toBe(false);
      expect(isLiveApiServable('stm')).toBe(false);
    }
  });

  it('requires env key for active key-gated agencies (sfmta)', () => {
    const muni = LIVE_POLLING_ROUTES.find(r => r.slug === 'sfmta' && r.active);
    expect(muni).toBeTruthy();
    const envKey = muni!.apiKeyParamEnvVar ?? muni!.apiKeyHeaderEnvVar;
    expect(envKey).toBeTruthy();

    stashEnv(envKey!);
    delete process.env[envKey!];
    expect(isLiveEligibleSlug('sfmta')).toBe(true);
    expect(isLiveApiServable('sfmta')).toBe(false);

    process.env[envKey!] = 'test-key';
    expect(isLiveApiServable('sfmta')).toBe(true);
  });
});
