import { beforeEach, describe, expect, it, vi } from 'vitest';
import liveStop from '../live-stop.js';

describe('live-stop API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('400s when stop or agency is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect((await liveStop.fetch(new Request('http://localhost/api/live-stop?agency=ttc'))).status).toBe(400);
    expect((await liveStop.fetch(new Request('http://localhost/api/live-stop?stop=1'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown agencies without contacting an upstream', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const res = await liveStop.fetch(new Request('http://localhost/api/live-stop?agency=evil.example&stop=1'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502s when the upstream feed fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    const res = await liveStop.fetch(new Request('http://localhost/api/live-stop?agency=ttc&stop=14994'));
    expect(res.status).toBe(502);
  });
});
