import { describe, expect, it, vi } from 'vitest';
import handler from '../history-adherence.js';

describe('history-adherence query validation', () => {
  it.each([
    ['an unknown extra param', 'agency=ttc&route=504&days=7&bust=1'],
    ['a repeated param', 'agency=ttc&route=504&days=7&days=7'],
    ['days of zero', 'agency=ttc&route=504&days=0'],
    ['days over 30', 'agency=ttc&route=504&days=31'],
    ['negative days', 'agency=ttc&route=504&days=-3'],
    ['non-numeric days', 'agency=ttc&route=504&days=abc'],
    ['fractional days', 'agency=ttc&route=504&days=1.5'],
  ])('rejects %s with 400 before touching storage', async (_label, query) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await handler.fetch(new Request(`https://atlas.test/api/history-adherence?${query}`, {
      headers: { 'x-real-ip': `198.51.100.${Math.floor(Math.random() * 250)}` },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid query parameters.' });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('still reaches the agency/route check when params are well-formed', async () => {
    const response = await handler.fetch(new Request('https://atlas.test/api/history-adherence?agency=nope&route=1&days=7', {
      headers: { 'x-real-ip': '198.51.100.251' },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid agency/route pair.' });
  });
});
