import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAgencyGeoCache, fetchAgencyGeo, getCachedAgencyGeo } from '../agencyGeo';

const agency = { slug: 'ttc', name: 'TTC', url: 'https://example.com/ttc.json' };
const fc = {
  type: 'FeatureCollection' as const,
  features: [{
    type: 'Feature' as const,
    properties: {
      routeShortName: '63', day: 'Weekday', directionId: 0, headway: 10, tier: '10',
      headwayByPeriod: { midday: 10 }, headwayByPeriodSustained: { midday: true },
      worstDirectionHeadway: 175, worstDirectionHeadwayByPeriod: { midday: 175 },
    }, geometry: null,
  }, {
    type: 'Feature' as const,
    properties: {
      routeShortName: '63', day: 'Weekday', directionId: 1, headway: 10, tier: '10',
      headwayByPeriod: { midday: 10 }, headwayByPeriodSustained: { midday: true },
      worstDirectionHeadway: 175, worstDirectionHeadwayByPeriod: { midday: 175 },
    }, geometry: null,
  }, {
    type: 'Feature' as const,
    properties: {
      routeShortName: '63', day: 'Weekday', directionId: 1, headway: 175, tier: 'infrequent',
      headwayByPeriod: { midday: 175 }, headwayByPeriodSustained: { midday: false },
      worstDirectionHeadway: 175, worstDirectionHeadwayByPeriod: { midday: 175 },
    }, geometry: null,
  }],
};

function mockFetch(fcBody: typeof fc = fc) {
  return vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('data-version.json')) {
      return { ok: true, json: async () => ({ v: 'test-v1', updatedAt: '2026-08-07T00:00:00Z' }) };
    }
    return { ok: true, json: async () => fcBody };
  });
}

afterEach(() => {
  clearAgencyGeoCache();
  vi.restoreAllMocks();
});

describe('fetchAgencyGeo', () => {
  it('caches successful fetches by slug', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const first = await fetchAgencyGeo(agency);
    const second = await fetchAgencyGeo(agency);
    expect(first).toBe(second);
    expect(getCachedAgencyGeo('ttc')).toBe(first);
    expect(fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('ttc.json')).length).toBe(1);
  });

  it('dedupes concurrent requests for the same slug', async () => {
    let resolveJson!: (v: typeof fc) => void;
    const jsonPromise = new Promise<typeof fc>(r => { resolveJson = r; });
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('data-version.json')) return { ok: true, json: async () => ({ v: 'test-v1' }) };
      return { ok: true, json: () => jsonPromise };
    });
    vi.stubGlobal('fetch', fetchMock);
    const a = fetchAgencyGeo(agency);
    const b = fetchAgencyGeo(agency);
    resolveJson(fc);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(rb);
    expect(fetchMock.mock.calls.filter((c: unknown[]) => String(c[0]).includes('ttc.json')).length).toBe(1);
  });

  it('re-stamps worstDirection so rare short-turns cannot gate the route (TTC 63)', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const data = await fetchAgencyGeo(agency);
    for (const f of data.features) {
      expect(f.properties?.worstDirectionHeadway).toBe(10);
      expect(f.properties?.worstDirectionHeadwayByPeriod).toEqual({ midday: 10 });
    }
  });

  it('uses R2 data-version as the query cache buster', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    await fetchAgencyGeo(agency);
    const geoCall = fetchMock.mock.calls.find((c: unknown[]) => String(c[0]).includes('ttc.json'));
    expect(String(geoCall?.[0])).toContain('v=test-v1');
  });
});
