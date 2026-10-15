import { beforeEach, describe, expect, it, vi } from 'vitest';
import liveStop from '../live-stop.js';
import liveAdherence from '../live-adherence.js';

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

describe('live-adherence API', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('400s when route or agency is missing', async () => {
    expect((await liveAdherence.fetch(new Request('http://localhost/api/live-adherence?agency=ttc'))).status).toBe(400);
    expect((await liveAdherence.fetch(new Request('http://localhost/api/live-adherence?route=504'))).status).toBe(400);
  });

  it('returns noData for unconfigured routes without contacting an upstream', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    for (const qs of ['agency=ttc&route=999', 'agency=nowhere&route=1', 'agency=ttc&route=501']) {
      const res = await liveAdherence.fetch(new Request(`http://localhost/api/live-adherence?${qs}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ noData: true });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns noData when the feed is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    const res = await liveAdherence.fetch(new Request('http://localhost/api/live-adherence?agency=ttc&route=504'));
    expect(await res.json()).toEqual({ noData: true });
  });
});
