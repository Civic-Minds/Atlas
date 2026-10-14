import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../atlas-pmtiles.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('atlas-pmtiles proxy', () => {
  it('refuses requests without a verified release instead of serving unpaired legacy tiles', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    for (const query of ['', '?variant=overview', '?release_id=unavailable']) {
      const response = await handler.fetch(new Request(`https://atlas.test/api/atlas-pmtiles${query}`));
      expect(response.status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('serves tiles from the requested release folder', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('tiles', { status: 206 }));
    vi.stubGlobal('fetch', upstream);
    const response = await handler.fetch(new Request('https://atlas.test/api/atlas-pmtiles?release_id=release-abc&variant=overview'));
    expect(response.status).toBe(206);
    expect(String(upstream.mock.calls[0][0])).toMatch(/atlas\/releases\/release-abc\/atlas-overview\.pmtiles$/);
  });

  it('lets browsers keep a release\'s ranges, and never caches an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('tiles', { status: 206 })).mockResolvedValueOnce(new Response('nope', { status: 500 })));
    const ok = await handler.fetch(new Request('https://atlas.test/api/atlas-pmtiles?release_id=release-abc'));
    expect(ok.headers.get('Cache-Control')).toMatch(/max-age=31536000, immutable/);
    const bad = await handler.fetch(new Request('https://atlas.test/api/atlas-pmtiles?release_id=release-abc'));
    expect(bad.headers.get('Cache-Control')).toBe('no-store');
  });
});
