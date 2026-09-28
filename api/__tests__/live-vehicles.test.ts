import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../live-vehicles.js';

describe('local live vehicles API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unknown agencies without contacting an upstream feed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=unknown'));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Unknown') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a clear upstream error when the positions feed is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream unavailable', { status: 503 }),
    );

    const response = await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=ttc'));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      reason: 'http-error',
      error: "Can't reach this feed right now.",
    });
  });
});
