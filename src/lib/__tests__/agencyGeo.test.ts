import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAgencyGeoCache, fetchAgencyGeo, getCachedAgencyGeo } from '../agencyGeo';

const agency = { slug: 'ttc', name: 'TTC', url: 'https://example.com/ttc.json' };
const fc = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: null }] };

afterEach(() => {
  clearAgencyGeoCache();
  vi.restoreAllMocks();
});

describe('fetchAgencyGeo', () => {
  it('caches successful fetches by slug', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fc),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchAgencyGeo(agency);
    const second = await fetchAgencyGeo(agency);

    expect(first).toBe(second);
    expect(getCachedAgencyGeo('ttc')).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same slug', async () => {
    let resolveJson!: (v: typeof fc) => void;
    const jsonPromise = new Promise<typeof fc>(r => { resolveJson = r; });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => jsonPromise,
    });
    vi.stubGlobal('fetch', fetchMock);

    const a = fetchAgencyGeo(agency);
    const b = fetchAgencyGeo(agency);
    resolveJson(fc);
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra).toBe(rb);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
