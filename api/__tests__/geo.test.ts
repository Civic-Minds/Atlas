import { describe, expect, it } from 'vitest';
import handler from '../geo';
import type { ApiRequest } from '../../shared/request';
import type { ApiResponse } from '../../shared/http';

function call(headers: Record<string, string>) {
  const set: Record<string, string> = {};
  let body = '';
  const res = { statusCode: 0, setHeader: (n: string, v: string) => { set[n.toLowerCase()] = v; }, end: (b?: string) => { body = b ?? ''; } } as unknown as ApiResponse;
  return handler({ url: '/api/geo', headers } as unknown as ApiRequest, res).then(() => ({ status: (res as unknown as { statusCode: number }).statusCode, headers: set, body }));
}

describe('api/geo (CIV-977)', () => {
  it("lets only the visitor's own browser keep the approximate location for an hour", async () => {
    const r = await call({ 'x-vercel-ip-latitude': '43.65', 'x-vercel-ip-longitude': '-79.38', 'x-vercel-ip-city': 'Toronto' });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('private, max-age=3600');
    expect(JSON.parse(r.body)).toMatchObject({ latitude: 43.65, longitude: -79.38, approximate: true });
  });

  it('a request with no location is not cached', async () => {
    const r = await call({});
    expect(r.status).toBe(404);
    expect(r.headers['cache-control']).toBeUndefined();
  });
});
