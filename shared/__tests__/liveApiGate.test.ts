import { afterEach, describe, expect, it } from 'vitest';
import {
  getLiveRouteConfig,
  isLiveApiServable,
  isLiveEligibleSlug,
  LIVE_POLLING_ROUTES,
} from '../livePollingConfig';

describe('getLiveRouteConfig / vehiclesOnly', () => {
  it('keeps Halifax route 1 as full adherence and excludes vehiclesOnly siblings', () => {
    const full = getLiveRouteConfig('halifax', '1');
    expect(full).toBeTruthy();
    expect(full!.vehiclesOnly).toBeFalsy();
    expect(Object.keys(full!.targetStops).length).toBeGreaterThan(0);

    for (const rsn of ['2', '4', '5', '7A', '7B', 'FerD']) {
      expect(getLiveRouteConfig('halifax', rsn)).toBeUndefined();
      const vo = LIVE_POLLING_ROUTES.find(
        r => r.slug === 'halifax' && r.displayRouteShortName === rsn,
      );
      expect(vo?.vehiclesOnly).toBe(true);
      expect(vo?.routeIds).toEqual([rsn]);
    }
  });

  it('lists multiple Halifax vehiclesOnly routes under one shared vehicle feed URL', () => {
    const halifax = LIVE_POLLING_ROUTES.filter(r => r.slug === 'halifax');
    const feedUrls = new Set(halifax.map(r => r.vehiclePositionsUrl));
    expect(feedUrls.size).toBe(1);
    expect(halifax.some(r => !r.vehiclesOnly && r.displayRouteShortName === '1')).toBe(true);
    expect(halifax.filter(r => r.vehiclesOnly).map(r => r.displayRouteShortName).sort()).toEqual(
      ['2', '4', '5', '7A', '7B', 'FerD'].sort(),
    );
  });
});

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
