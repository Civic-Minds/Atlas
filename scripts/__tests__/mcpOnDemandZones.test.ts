import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// on_demand_zones (CIV-2078): the map's zone wording, zones covering or near a place, beta marked, a zone in pieces once.
vi.mock('../mcp/atlasData', () => {
  const hamilton = { slug: 'hamilton', name: 'Hamilton Street Railway' };
  return {
    publicAgencies: async () => [hamilton, { slug: 'ttc', name: 'Toronto Transit Commission' }],
    availableAgencies: async () => [hamilton],
    findAgency: async (q: string, list: Array<{ slug: string; name: string }>) => list.find(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.slug === q) ?? null,
    placeStops: async (_a: unknown, place: string) => ({
      stops: [],
      seeds: place === 'Inside' ? [{ name: 'Inside Stop', lat: 0.5, lon: 0.5 }] : place === 'Near' ? [{ name: 'Near Stop', lat: 0.5, lon: 1.002 }] : place === 'Far' ? [{ name: 'Far Stop', lat: 0.5, lon: 2 }] : [],
      corner: null,
    }),
  };
});

const square = (x: number) => [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]];
const files: Record<string, unknown> = {
  'manifest.json': { schemaVersion: 1, version: 'v1', generatedAt: '', indexKey: 'v/v1/index.json' },
  'v/v1/index.json': { schemaVersion: 1, version: 'v1', generatedAt: '', services: [{
    slug: 'hamilton', public: false, bbox: [0, 0, 1, 3], geometryKey: 'agencies/hamilton.json',
    area: { sourceUrl: 'https://example.test', sourceLabel: 'x', serviceName: 'Trans-Cab', bookingInfo: 'Call to book.',
      tripRules: 'Trips can start and end anywhere in the zone.',
      zoneMetadata: { East: { availability: { Weekday: [{ startHour: 6, endHour: 22 }], Saturday: [], Sunday: [] } } } },
  }] },
  'v/v1/agencies/hamilton.json': { slug: 'hamilton', features: [
    { type: 'Feature', properties: { areaName: 'East' }, geometry: { type: 'Polygon', coordinates: square(0) } },
    { type: 'Feature', properties: { areaName: 'East' }, geometry: { type: 'Polygon', coordinates: square(5) } },
  ] },
};

describe('on_demand_zones', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const key = url.replace('https://od.test/', '');
      return key in files ? new Response(JSON.stringify(files[key])) : new Response('', { status: 404 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const call = async (args: Record<string, unknown>) => {
    const { onDemandHandlers, useOnDemandBase } = await import('../mcp/onDemandTools');
    useOnDemandBase('https://od.test', true);
    return onDemandHandlers.on_demand_zones(args) as Promise<Record<string, any>>;
  };

  it('lists every zone once, in the map card’s words, marked as beta', async () => {
    const r = await call({ agency: 'Hamilton' });
    expect(r.beta).toMatch(/beta/i);
    expect(r.zones).toHaveLength(1);
    expect(r.zones[0]).toMatchObject({ zone: 'East', service: 'Trans-Cab', booking: 'Call to book.', tripRules: 'Trips can start and end anywhere in the zone.' });
    expect(r.zones[0].serviceHours[0]).toMatch(/^Mon–Fri 6 AM–10 PM$/);
  });

  it('says which zones cover a place or come near it', async () => {
    expect((await call({ agency: 'Hamilton', place: 'Inside' })).zones[0]).toMatchObject({ zone: 'East', covers: true });
    const near = (await call({ agency: 'Hamilton', place: 'Near' })).zones[0];
    expect(near.covers).toBe(false);
    expect(near.metresAway).toBeGreaterThan(100);
    expect(near.metresAway).toBeLessThan(500);
    expect((await call({ agency: 'Hamilton', place: 'Far' })).zones).toEqual([]);
  });

  it('says plainly when an agency has no zones', async () => {
    expect((await call({ agency: 'Toronto' })).note).toMatch(/no on-demand zones/);
  });

  it('hides beta-only services when told to read promoted ones only', async () => {
    const { onDemandHandlers, useOnDemandBase } = await import('../mcp/onDemandTools');
    useOnDemandBase('https://od.test', false);
    expect(((await onDemandHandlers.on_demand_zones({ agency: 'Hamilton' })) as { zones: unknown[] }).zones).toEqual([]);
  });
});
