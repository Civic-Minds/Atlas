import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { useSelectionFraming } from '../useSelectionFraming';

/** A map stuck part way (zoom 11.6) whatever it's asked, so every finisher that runs would jump. */
function fakeMap() {
  const handlers: Record<string, Array<() => void>> = {};
  const point = { x: 0, dist: () => 0 };
  return {
    on: (t: string, f: () => void) => { (handlers[t] ??= []).push(f); },
    off: (t: string, f: () => void) => { handlers[t] = (handlers[t] ?? []).filter(h => h !== f); },
    getContainer: () => ({ clientWidth: 1200, clientHeight: 800 }),
    cameraForBounds: () => ({ zoom: 12, center: { lng: 0, lat: 0 } }),
    getZoom: () => 11.6,
    getCenter: () => ({ lng: 0, lat: 0 }),
    project: () => point,
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    fire: (t: string) => [...(handlers[t] ?? [])].forEach(h => h()),
    count: (t: string) => (handlers[t] ?? []).length,
  };
}

const line = (routeId: string, coordinates: number[][]) => ({
  type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates }, properties: { routeId, routeShortName: routeId },
});
const layers = { tank: { type: 'FeatureCollection' as const, features: [line('3', [[-84.56, 39.08], [-84.5, 39.1]]), line('8', [[-84.6, 39.0], [-84.58, 39.02]])] } };
const base = { agencies: [], layers, selectedStop: null, initialOnDemandSlug: null, regionalView: null as never };

describe('useSelectionFraming finish (CIV-1252 review)', () => {
  it("a route picked mid-fit cancels the old fit's finish, so the map never jumps back to the old route", () => {
    const map = fakeMap();
    const ref = { current: map as unknown as maplibregl.Map };
    const { rerender, unmount } = renderHook(({ route }) => useSelectionFraming(ref, true, { ...base, selectedRoute: route }), { initialProps: { route: 'tank::3' } });
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    rerender({ route: 'tank::8' });
    expect(map.fitBounds).toHaveBeenCalledTimes(2);
    expect(map.count('moveend')).toBe(1);
    map.fire('moveend'); // route 8's fit cut short
    const jumps = map.fitBounds.mock.calls.filter(c => c[1]?.duration === 0);
    expect(jumps).toHaveLength(1);
    expect(jumps[0][0]).toEqual([[-84.6, 39], [-84.58, 39.02]]);
    unmount();
  });

  it('unmounting the map removes the finisher and its page listeners', () => {
    const map = fakeMap();
    const ref = { current: map as unknown as maplibregl.Map };
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useSelectionFraming(ref, true, { ...base, selectedRoute: 'tank::3' }));
    const added = add.mock.calls.filter(c => c[2] && (c[2] as AddEventListenerOptions).capture).length;
    unmount();
    expect(map.count('moveend')).toBe(0);
    expect(remove.mock.calls.filter(c => c[2] && (c[2] as EventListenerOptions).capture).length).toBe(added);
    add.mockRestore();
    remove.mockRestore();
  });
});
