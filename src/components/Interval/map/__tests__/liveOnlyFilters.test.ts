import { describe, expect, it, vi } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { applyLiveOnlyFilters, LIVE_ONLY_FILTERED_LAYERS, liveRoutesFilter } from '../useRouteStyling';
import { DRAWN_ROUTE_LAYERS } from '../drawnRoutes';

function fakeMap(layers: readonly string[]) {
  const map = { getLayer: vi.fn((id: string) => (layers.includes(id) ? { id } : undefined)), setFilter: vi.fn() };
  return map as typeof map & Parameters<typeof applyLiveOnlyFilters>[0];
}

const matches = (properties: Record<string, unknown>) =>
  featureFilter(liveRoutesFilter() as never, {} as never).filter({ zoom: 12 } as never, { properties } as never);

describe('Live draws only its own routes (CIV-1090)', () => {
  it('keeps the section colours and the frequency pieces to Live routes, not only the lines', () => {
    const map = fakeMap(LIVE_ONLY_FILTERED_LAYERS);
    applyLiveOnlyFilters(map, true);
    expect(map.setFilter.mock.calls.map(([id]) => id)).toEqual([...LIVE_ONLY_FILTERED_LAYERS]);
    for (const [, filter] of map.setFilter.mock.calls) expect(filter).toEqual(liveRoutesFilter());
  });

  it('clears those filters outside Live, and skips layers the map does not have', () => {
    const map = fakeMap(['route-segments-layer']);
    applyLiveOnlyFilters(map, false);
    expect(map.setFilter.mock.calls).toEqual([['route-segments-layer', null]]);
  });

  it('matches a Live route and nothing else', () => {
    expect(matches({ agencySlug: 'ttc', routeShortName: '504' })).toBe(true);
    // TTC buses, GO and MiWay sections stayed drawn in Live before (Ryan's 2026-10-28 screenshot).
    expect(matches({ agencySlug: 'ttc', routeShortName: '96' })).toBe(false);
    expect(matches({ agencySlug: 'go', routeShortName: '41' })).toBe(false);
    expect(matches({ agencySlug: 'miway', routeShortName: '30' })).toBe(false);
  });

  it('covers every drawn route layer that has no filter of its own', () => {
    // routeFilter covers these; the selected-route and Night / Frequent Service layers draw their own sets.
    const ownFilter = new Set(['overview-routes-layer', 'routes-layer', 'selected-route-layer', 'selected-local-route-layer',
      'selected-route-segments-layer', 'night-service-routes-layer', 'frequent-service-routes-layer']);
    const rest = DRAWN_ROUTE_LAYERS.filter(id => !ownFilter.has(id));
    expect(rest.every(id => (LIVE_ONLY_FILTERED_LAYERS as readonly string[]).includes(id))).toBe(true);
  });
});
