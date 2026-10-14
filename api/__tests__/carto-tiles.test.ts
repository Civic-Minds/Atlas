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
});
