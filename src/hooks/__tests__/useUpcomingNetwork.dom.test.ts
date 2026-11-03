import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, upcomingNetwork: true }, UPCOMING_URL_OVERRIDE: '/up' };
});

import { resetUpcomingNetworkCacheForTests, upcomingCacheKey, useUpcomingNetwork } from '../useUpcomingNetwork';

const agencies = [{ slug: 'tank', name: 'TANK' }, { slug: 'ttc', name: 'TTC' }];
const routes = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: { routeId: '1', routeShortName: '1' } }] };

function mockFetch(files: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const path = url.split('?')[0];
    return path in files ? { ok: true, json: async () => files[path] } : { ok: false, status: 404, json: async () => ({}) };
  }));
  return calls;
}

beforeEach(() => resetUpcomingNetworkCacheForTests());
afterEach(() => vi.unstubAllGlobals());

describe('useUpcomingNetwork (CIV-1252)', () => {
  it('reads the index while Compare is open, and the route files only once map B is on the upcoming network', async () => {
    const calls = mockFetch({
      '/up/atlas/upcoming/index.json': { generatedAt: 'x', agencies: [{ slug: 'tank', feedStart: '20991107', feedVersion: '20261022' }] },
      '/up/atlas/upcoming/tank.json': routes,
    });
    const { result, rerender } = renderHook(({ active }) => useUpcomingNetwork({ enabled: true, active, agencies }), { initialProps: { active: false } });
    await waitFor(() => expect(result.current.indexLoaded).toBe(true));
    expect(result.current.entries.map(e => e.slug)).toEqual(['tank']);
    expect(result.current.layers).toEqual({});
    expect(calls.some(u => u.includes('tank.json'))).toBe(false);

    rerender({ active: true });
    await waitFor(() => expect(Object.keys(result.current.layers)).toEqual(['tank']));
    expect(result.current.layers.tank.features[0].properties?.agencyName).toBe('TANK');
    expect(calls.find(u => u.includes('tank.json'))).toBe('/up/atlas/upcoming/tank.json?v=20261022');
  });

  it('with no index file, there is nothing to choose', async () => {
    mockFetch({});
    const { result } = renderHook(() => useUpcomingNetwork({ enabled: true, active: true, agencies }));
    await waitFor(() => expect(result.current.indexLoaded).toBe(true));
    expect(result.current.entries).toEqual([]);
    expect(result.current.layers).toEqual({});
  });

  it('a route file that fails is reported, so map B keeps that agency on its current network', async () => {
    mockFetch({ '/up/atlas/upcoming/index.json': [{ slug: 'tank', feedStart: '20991107' }] });
    const { result } = renderHook(() => useUpcomingNetwork({ enabled: true, active: true, agencies }));
    await waitFor(() => expect(result.current.failedSlugs.has('tank')).toBe(true));
    expect(result.current.layers).toEqual({});
  });

  it('never caches upcoming routes under the bare slug the current-network loader uses', () => {
    expect(upcomingCacheKey({ slug: 'tank', feedVersion: '20261022' })).toBe('upcoming:tank:20261022');
  });
});
