import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVACY_REGION_MAX_AGE_MS, privacyRegionCountry } from '../privacyRegion';

const reply = (country: string) => vi.fn(async () => new Response(JSON.stringify({ country }), { status: 200 }));

const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };

describe('privacyRegionCountry (CIV-977)', () => {
  beforeEach(() => { store.clear(); vi.stubGlobal('localStorage', storage); });
  afterEach(() => vi.unstubAllGlobals());

  it('asks once, then answers from this browser for 30 days', async () => {
    const fetch = reply('CA'); vi.stubGlobal('fetch', fetch);
    expect(await privacyRegionCountry(1000)).toBe('CA');
    expect(await privacyRegionCountry(1000 + PRIVACY_REGION_MAX_AGE_MS - 1)).toBe('CA');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await privacyRegionCountry(1000 + PRIVACY_REGION_MAX_AGE_MS)).toBe('CA');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not remember an unknown country', async () => {
    const fetch = reply('XX'); vi.stubGlobal('fetch', fetch);
    expect(await privacyRegionCountry(1)).toBe('XX');
    await privacyRegionCountry(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('still asks when storage throws, and rejects when the request fails', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    vi.stubGlobal('fetch', reply('DE'));
    expect(await privacyRegionCountry(1)).toBe('DE');
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(privacyRegionCountry(1)).rejects.toThrow();
  });
});
