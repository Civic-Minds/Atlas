import { afterEach, describe, expect, it, vi } from 'vitest';

// CIV-321: the sections file is beta-only. FEATURES is mocked so both builds can be checked here.
const flags = vi.hoisted(() => ({ segmentColours: false }));
vi.mock('../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/config')>();
  return { ...actual, FEATURES: new Proxy(actual.FEATURES, { get: (t, k) => (k === 'segmentColours' ? flags.segmentColours : t[k as keyof typeof t]) }) };
});

import { clearAgencyGeoCache, fetchAgencyGeo } from '../agencyGeo';
import { clearDataReleaseCache } from '../dataRelease';
import { extractAgencySections } from '../../../shared/agencySections';

const agency = { slug: 'go', name: 'GO', url: 'https://example.com/go.json' };
const line = (directionId: number) => ({
  type: 'Feature' as const,
  properties: { routeId: 'KI', directionId, day: 'Weekday', headsign: 'Union', stopOrder: ['a', 'b'], fullLine: [[0, 0], [1, 1]], stretchStopPeriodValues: { midday: '30*2' } } as Record<string, unknown>,
  geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 1]] },
});

function mockFetch() {
  const routes = { type: 'FeatureCollection' as const, features: [line(0), line(1)] };
  const sections = extractAgencySections(routes.features);
  return vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('data-version.json')) return { ok: true, json: async () => ({ v: 'test-v1', updatedAt: '2026-10-18T00:00:00Z' }) };
    if (url.includes('go-sections.json')) return { ok: true, json: async () => structuredClone(sections) };
    return { ok: true, json: async () => structuredClone(routes) };
  });
}
const sectionsCalls = (m: ReturnType<typeof mockFetch>) => m.mock.calls.filter((c: unknown[]) => String(c[0]).includes('-sections.json'));

afterEach(() => {
  clearAgencyGeoCache();
  clearDataReleaseCache();
  vi.restoreAllMocks();
});

describe('agency sections file (CIV-321)', () => {
  it('is never fetched by the public build', async () => {
    flags.segmentColours = false;
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchAgencyGeo(agency);
    expect(sectionsCalls(fetchMock)).toHaveLength(0);
    expect(data.features[0].properties?.fullLine).toBeUndefined();
  });

  it('is fetched once on beta and put back on the matching route features', async () => {
    flags.segmentColours = true;
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchAgencyGeo(agency);
    await fetchAgencyGeo(agency);
    expect(sectionsCalls(fetchMock)).toHaveLength(1);
    expect(data.features[1].properties).toMatchObject({ directionId: 1, fullLine: [[0, 0], [1, 1]], stretchStopPeriodValues: { midday: '30*2' } });
  });

  it('leaves the routes as they are when the beta sections file is missing', async () => {
    flags.segmentColours = true;
    const base = mockFetch();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: RequestInfo | URL) =>
      String(input).includes('-sections.json') ? { ok: false, status: 404, json: async () => null } : base(input)));
    const data = await fetchAgencyGeo(agency);
    expect(data.features).toHaveLength(2);
    expect(data.features[0].properties?.fullLine).toBeUndefined();
  });
});
