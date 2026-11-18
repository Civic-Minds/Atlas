import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/dataRelease.js', () => ({ resolveDataRelease: async () => ({ releaseId: 'r' }), dataReleasePmtilesUrl: () => 'https://example.invalid/a.pmtiles' }));
let lines: unknown[] = [];
vi.mock('../../shared/shareImage.js', async importOriginal => ({ ...(await importOriginal<object>()), frameLines: async () => lines }));

import handler, { SHARE_IMAGE_CACHE } from '../share-image';

function run(query: string) {
  const out = { status: 0, headers: {} as Record<string, string>, body: undefined as unknown };
  const res = { statusCode: 0, setHeader: (k: string, v: string) => { out.headers[k] = v; }, end: (b?: unknown) => { out.body = b; } };
  return handler({ url: `/api/share-image${query}` } as never, res as never).then(() => ({ ...out, status: res.statusCode }));
}

describe('api/share-image (CIV-1393)', () => {
  it('sends a link with no valid spot to the default picture', async () => {
    const r = await run('?lat=x&lon=1');
    expect([r.status, r.headers.Location]).toEqual([302, '/assets/share/toronto.jpg']);
  });

  it("sends a spot with no lines to the nearest city's picture, not a blank one", async () => {
    lines = [];
    const r = await run('?lat=41.880&lon=-87.630');
    expect([r.status, r.headers.Location]).toEqual([302, '/assets/share/chicago.jpg']);
  });

  it('draws a cached PNG when the frame has lines', async () => {
    lines = [{ colour: '#22863a', width: 5, rank: 10, points: new Float32Array([0, 0, 100, 100]) }];
    const r = await run('?lat=41.880&lon=-87.630');
    expect([r.status, r.headers['Content-Type'], r.headers['Cache-Control']]).toEqual([200, 'image/png', SHARE_IMAGE_CACHE]);
    expect((r.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });
});
