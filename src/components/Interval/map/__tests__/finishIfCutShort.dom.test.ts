import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { finishIfCutShort } from '../useSelectionFraming';

/** A map whose camera sits at `zoom`, with the fit target at zoom 12. Fire its events by hand. */
function fakeMap(zoom: number) {
  const handlers: Record<string, Array<(e: { originalEvent?: unknown }) => void>> = {};
  const point = (x: number) => ({ dist: (o: { x: number }) => Math.abs(x - o.x), x });
  const map = {
    on: (t: string, f: (e: { originalEvent?: unknown }) => void) => { (handlers[t] ??= []).push(f); },
    off: (t: string, f: (e: { originalEvent?: unknown }) => void) => { handlers[t] = (handlers[t] ?? []).filter(h => h !== f); },
    once: (t: string, f: (e: { originalEvent?: unknown }) => void) => {
      const w = (e: { originalEvent?: unknown }) => { map.off(t, w); f(e); };
      map.on(t, w);
    },
    getContainer: () => ({ clientWidth: 1200, clientHeight: 800 }),
    cameraForBounds: () => ({ zoom: 12, center: { lng: 0, lat: 0 } }),
    getZoom: () => zoom,
    getCenter: () => ({ lng: 0, lat: 0 }),
    project: () => point(0),
    fitBounds: vi.fn(),
    fire: (t: string, e: { originalEvent?: unknown } = {}) => [...(handlers[t] ?? [])].forEach(h => h(e)),
  };
  return map;
}
const bounds: maplibregl.LngLatBoundsLike = [[-84.56, 39.08], [-84.5, 39.1]];

describe('finishIfCutShort (CIV-1252 review: a route opened from a link left half framed)', () => {
  it('jumps to the fit when the animation was stopped part way (a map resize stops it)', () => {
    const map = fakeMap(11.6);
    finishIfCutShort(map as unknown as maplibregl.Map, bounds);
    map.fire('moveend');
    expect(map.fitBounds).toHaveBeenCalledWith(bounds, expect.objectContaining({ duration: 0, maxZoom: 14 }));
    // Once only.
    map.fire('moveend');
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('leaves a fit that finished alone', () => {
    const map = fakeMap(12);
    finishIfCutShort(map as unknown as maplibregl.Map, bounds);
    map.fire('moveend');
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("never fights the user: MapLibre's real order is press, then the stop's moveend, then the user's own move", () => {
    for (const input of [
      () => window.dispatchEvent(new Event('mousedown')),
      () => window.dispatchEvent(new Event('touchstart')),
      () => window.dispatchEvent(new Event('wheel')),
    ]) {
      const map = fakeMap(11.6);
      finishIfCutShort(map as unknown as maplibregl.Map, bounds);
      input();
      map.fire('moveend'); // the drag or scroll stops the animation first; no originalEvent on this moveend
      map.fire('movestart', { originalEvent: {} }); // the user's own move comes after
      expect(map.fitBounds).not.toHaveBeenCalled();
    }
  });

  it("a drag on Compare's other map counts too: its press reaches the page, while this map only moves by code", () => {
    const map = fakeMap(11.6);
    finishIfCutShort(map as unknown as maplibregl.Map, bounds);
    const otherCanvas = document.createElement('canvas');
    document.body.appendChild(otherCanvas);
    otherCanvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    map.fire('moveend'); // stopped by the linked jumpTo, no originalEvent
    expect(map.fitBounds).not.toHaveBeenCalled();
    otherCanvas.remove();
  });

  it('stops listening once the fit is done, so later input on the page is not tracked', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const map = fakeMap(12);
    finishIfCutShort(map as unknown as maplibregl.Map, bounds);
    map.fire('moveend');
    expect(remove.mock.calls.map(c => c[0]).sort()).toEqual(['keydown', 'mousedown', 'pointerdown', 'touchstart', 'wheel']);
    remove.mockRestore();
  });
});
