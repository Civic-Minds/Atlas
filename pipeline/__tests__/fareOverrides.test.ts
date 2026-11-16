import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FARE_OVERRIDES_KEY, loadFareOverrides, manualBaseFareFor } from '../fareOverrides.js';

const quiet = () => {};
const reply = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

describe('loadFareOverrides (#1367)', () => {
  it('reads through R2 when the run has keys, never the public domain', async () => {
    const keys: string[] = [];
    const overrides = await loadFareOverrides({
      hasR2Keys: true,
      r2Get: async key => { keys.push(key); return '{"ttc":{"adult":3.3}}'; },
      fetch: (async () => { throw new Error('public fetch must not be used'); }) as typeof fetch,
      log: quiet,
    });
    expect(keys).toEqual([FARE_OVERRIDES_KEY]);
    expect(overrides.ttc?.adult).toBe(3.3);
  });

  it('a missing file in R2 means no overrides', async () => {
    await expect(loadFareOverrides({ hasR2Keys: true, r2Get: async () => null, log: quiet })).resolves.toEqual({});
  });

  it('an R2 error fails the run instead of falling back to legacy fares', async () => {
    await expect(loadFareOverrides({ hasR2Keys: true, r2Get: async () => { throw new Error('ECONNRESET'); }, log: quiet }))
      .rejects.toThrow('ECONNRESET');
  });

  it('a corrupt file fails the run', async () => {
    await expect(loadFareOverrides({ hasR2Keys: true, r2Get: async () => '<html>Just a moment...</html>', log: quiet }))
      .rejects.toThrow(/not valid JSON/);
    await expect(loadFareOverrides({ hasR2Keys: true, r2Get: async () => '[]', log: quiet }))
      .rejects.toThrow(/not an object/);
  });

  describe('keyless dry run (public file)', () => {
    const base = { hasR2Keys: false, publicUrl: 'https://data.example', log: quiet };

    it('reads the public file', async () => {
      const overrides = await loadFareOverrides({ ...base, fetch: (async () => reply(200, '{"yrt":{"adult":4.25}}')) as typeof fetch });
      expect(overrides.yrt?.adult).toBe(4.25);
    });

    it('a 404 means no overrides', async () => {
      await expect(loadFareOverrides({ ...base, fetch: (async () => reply(404, 'nope')) as typeof fetch })).resolves.toEqual({});
    });

    it('a Cloudflare challenge fails the run and says who refused', async () => {
      const fetch = (async () => reply(403, 'Just a moment...', { server: 'cloudflare', 'cf-mitigated': 'challenge' })) as typeof globalThis.fetch;
      await expect(loadFareOverrides({ ...base, fetch })).rejects.toThrow(/HTTP 403 \(cloudflare cf-mitigated=challenge\)/);
    });

    it('a dropped connection fails the run', async () => {
      const fetch = (async () => { throw new TypeError('terminated'); }) as typeof globalThis.fetch;
      await expect(loadFareOverrides({ ...base, fetch })).rejects.toThrow('terminated');
    });
  });

  it('refresh, process-gtfs and the rebuild path read overrides the same way (#1535)', () => {
    for (const file of ['pipeline/refresh.ts', 'pipeline/process-gtfs.ts', 'pipeline/reprocess-derived-artifacts.ts']) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source).not.toContain('/atlas/fare-overrides.json');
      expect(source).toContain('loadFareOverrides()');
      expect(source).toContain('manualBaseFareFor(');
    }
  });
});

describe('manualBaseFareFor (#1535)', () => {
  const overrides = { stm: { adult: 3.75 }, translink: { adult: 2.85 }, empty: {} };

  it('uses the override adult fare ahead of the legacy fare', () => {
    expect(manualBaseFareFor(overrides, 'stm', undefined)).toBe(3.75);
    expect(manualBaseFareFor(overrides, 'translink', 9)).toBe(2.85);
  });

  it('falls back to the legacy fare, then to no fare', () => {
    expect(manualBaseFareFor(overrides, 'ttc', 3.3)).toBe(3.3);
    expect(manualBaseFareFor(overrides, 'empty', 2)).toBe(2);
    expect(manualBaseFareFor(overrides, 'ttc', null)).toBeUndefined();
    expect(manualBaseFareFor({}, 'ttc')).toBeUndefined();
  });

  it('keeps a zero override (free agencies)', () => {
    expect(manualBaseFareFor({ free: { adult: 0 } }, 'free', 2)).toBe(0);
  });
});
