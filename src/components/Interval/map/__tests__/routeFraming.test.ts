import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { frameRoute, routeFramePadding, selectionFramePadding } from '../routeFraming';

function fakeMap(width = 1200, height = 800, zoom = 10) {
  return {
    getContainer: () => ({ clientWidth: width, clientHeight: height }),
    getZoom: () => zoom,
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
  } as unknown as maplibregl.Map & { fitBounds: ReturnType<typeof vi.fn>; flyTo: ReturnType<typeof vi.fn> };
}

describe('routeFramePadding', () => {
  it('leaves room for the card on the left or right on wide screens', () => {
    expect(routeFramePadding(fakeMap())).toEqual({ top: 80, bottom: 80, left: 320, right: 80 });
    expect(routeFramePadding(fakeMap(), 'right')).toEqual({ top: 80, bottom: 80, left: 80, right: 280 });
  });

  it('uses the bottom-sheet padding on phones only when asked', () => {
    expect(routeFramePadding(fakeMap(390, 800), 'left', { phoneSheet: true })).toEqual({ top: 75, bottom: 360, left: 45, right: 45 });
    expect(routeFramePadding(fakeMap(390, 800))).toEqual({ top: 80, bottom: 80, left: 320, right: 80 });
    expect(routeFramePadding(fakeMap(1200, 800), 'left', { phoneSheet: true })).toEqual({ top: 80, bottom: 80, left: 320, right: 80 });
  });
});

describe('frameRoute', () => {
  it('does nothing without points', () => {
    const map = fakeMap();
    expect(frameRoute(map, [])).toBe(false);
    expect(map.fitBounds).not.toHaveBeenCalled();
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('fits the bounds with the default padding and max zoom', () => {
    const map = fakeMap();
    expect(frameRoute(map, [[-79.5, 43.6], [-79.3, 43.7], [-79.4, 43.65]])).toBe(true);
    expect(map.fitBounds).toHaveBeenCalledWith([[-79.5, 43.6], [-79.3, 43.7]], { padding: { top: 80, bottom: 80, left: 320, right: 80 }, maxZoom: 14 });
    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('honours the side, max zoom and phone sheet options', () => {
    const map = fakeMap(390, 800);
    frameRoute(map, [[0, 0], [1, 1]], { side: 'right', maxZoom: 16, phoneSheet: true });
    expect(map.fitBounds).toHaveBeenCalledWith([[0, 0], [1, 1]], { padding: { top: 75, bottom: 360, left: 45, right: 45 }, maxZoom: 16 });
  });

  it('flies to a single point without zooming out', () => {
    const map = fakeMap(1200, 800, 15);
    frameRoute(map, [[-79.4, 43.65], [-79.4, 43.65]]);
    expect(map.flyTo).toHaveBeenCalledWith({ center: [-79.4, 43.65], zoom: 15, padding: { top: 80, bottom: 80, left: 320, right: 80 }, duration: 900 });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it('takes custom padding, duration and max zoom (Live analysis map)', () => {
    const map = fakeMap();
    const padding = { top: 72, bottom: 72, left: 72, right: 72 };
    frameRoute(map, [[0, 0], [1, 1]], { padding, maxZoom: 15, duration: 0 });
    expect(map.fitBounds).toHaveBeenCalledWith([[0, 0], [1, 1]], { padding, maxZoom: 15, duration: 0 });
    frameRoute(map, [[2, 2]], { padding, maxZoom: 15, duration: 0 });
    expect(map.flyTo).toHaveBeenCalledWith({ center: [2, 2], zoom: 15, padding, duration: 0 });
  });
});

describe('selectionFramePadding (main map route selection)', () => {
  // Room MapLibre's fitBounds has left to fit the route into (it subtracts the padding from the canvas).
  const fitArea = (map: maplibregl.Map, p: maplibregl.PaddingOptions) => {
    const { clientWidth, clientHeight } = map.getContainer();
    return { width: clientWidth - (p.left ?? 0) - (p.right ?? 0), height: clientHeight - (p.top ?? 0) - (p.bottom ?? 0) };
  };

  it('frames above the phone bottom sheet instead of squeezing the route into a sliver (iPhone 402x874)', () => {
    const phone = fakeMap(402, 874);
    // The side-card padding left a 2px-wide column, so selecting TTC 80 zoomed out to the Great Lakes.
    expect(fitArea(phone, selectionFramePadding(phone, false)).width).toBe(2);
    const padding = selectionFramePadding(phone, true);
    expect(padding).toEqual({ top: 75, bottom: 393, left: 45, right: 45 });
    const area = fitArea(phone, padding);
    expect(area.width).toBeGreaterThan(300);
    expect(area.height).toBeGreaterThan(400);
  });

  it('keeps the side-card padding on wide screens even with the sheet feature on', () => {
    expect(selectionFramePadding(fakeMap(1200, 800), true)).toEqual({ top: 80, bottom: 80, left: 320, right: 80 });
    expect(selectionFramePadding(fakeMap(1200, 800), false)).toEqual({ top: 80, bottom: 80, left: 320, right: 80 });
  });
});
