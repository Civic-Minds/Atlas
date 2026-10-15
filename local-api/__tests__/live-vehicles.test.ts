import { beforeEach, describe, expect, it, vi } from 'vitest';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
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

  it.each([
    ['an extra param', 'agency=ttc&bust=1'],
    ['a repeated agency', 'agency=ttc&agency=ttc'],
    ['no agency', ''],
    ['a non-slug agency', 'agency=TTC%20'],
  ])('rejects %s with 400 without contacting an upstream feed', async (_label, query) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const response = await handler.fetch(new Request(`http://localhost/api/live-vehicles?${query}`));
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets the edge share a successful response for about 15 seconds', async () => {
    const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;
    const feed = FeedMessage.encode(FeedMessage.create({ header: { gtfsRealtimeVersion: '2.0' }, entity: [] })).finish();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(feed).buffer, { status: 200 }));
    const response = await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=ttc'));
    expect(response.status).toBe(200);
    const cache = response.headers.get('Cache-Control') ?? '';
    expect(cache).toContain('s-maxage=15');
    expect(cache).toContain('stale-while-revalidate=');
  });

  it('caches an upstream failure only briefly at the edge', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('down', { status: 503 }));
    const response = await handler.fetch(new Request('http://localhost/api/live-vehicles?agency=ttc'));
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=5');
  });
});
