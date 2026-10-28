import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../carto-tiles.js';

const tileUrl = 'https://atlas.test/api/carto-tiles?style=light_all&z=10&x=286&y=373';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('carto-tiles proxy', () => {
  it('lets browsers keep a good tile for 7 days and the edge keep it longer', async () => {
    vi.stubEnv('CARTO_BASEMAP_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('png', {
      status: 200,
      headers: { 'content-type': 'image/png', etag: '"martin-20261001-02"' },
    })));
    const response = await handler.fetch(new Request(tileUrl));
    expect(response.status).toBe(200);
    const cache = response.headers.get('Cache-Control') ?? '';
    expect(cache).toMatch(/(^|[ ,])max-age=604800(,|$)/);
    expect(cache).toMatch(/s-maxage=\d+/);
    expect(cache).toContain('stale-while-revalidate=');
  });

  it('never caches the "API KEY REQUIRED" watermark tile', async () => {
    vi.stubEnv('CARTO_BASEMAP_API_KEY', 'revoked-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('png', {
      status: 200,
      headers: { 'content-type': 'image/png', etag: '"wm-da89c20e77c1-light"' },
    })));
    const response = await handler.fetch(new Request(tileUrl));
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });

  it('never caches an upstream error', async () => {
    vi.stubEnv('CARTO_BASEMAP_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    const response = await handler.fetch(new Request(tileUrl));
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });

  it('does not cache a missing-key or bad-request error', async () => {
    vi.stubEnv('CARTO_BASEMAP_API_KEY', '');
    const noKey = await handler.fetch(new Request(tileUrl));
    expect(noKey.status).toBe(503);
    expect(noKey.headers.get('Cache-Control')).toBe('no-store, max-age=0');
  });

  it.each([
    ['an unknown extra param', 'style=light_all&z=10&x=286&y=373&audit=4179'],
    ['a repeated param', 'style=light_all&z=10&z=10&x=286&y=373'],
    ['a missing param', 'style=light_all&z=10&x=286'],
    ['a style outside the whitelist', 'style=voyager&z=10&x=286&y=373'],
    ['a zoom past the map range', 'style=light_all&z=23&x=0&y=0'],
    ['x outside 0..2^z-1', 'style=light_all&z=2&x=4&y=0'],
    ['y outside 0..2^z-1', 'style=light_all&z=2&x=0&y=4'],
    ['a non-numeric tile part', 'style=light_all&z=1e1&x=0&y=0'],
    ['a zero-padded tile part', 'style=light_all&z=010&x=286&y=373'],
  ])('rejects %s with 400 without contacting CARTO', async (_label, query) => {
    vi.stubEnv('CARTO_BASEMAP_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await handler.fetch(new Request(`https://atlas.test/api/carto-tiles?${query}`));
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store, max-age=0');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the edges of the valid tile range', async () => {
    vi.stubEnv('CARTO_BASEMAP_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('png', { status: 200 })));
    for (const query of ['style=dark_all&z=0&x=0&y=0', 'style=light_all&z=22&x=4194303&y=4194303']) {
      const response = await handler.fetch(new Request(`https://atlas.test/api/carto-tiles?${query}`));
      expect(response.status).toBe(200);
    }
  });
});
