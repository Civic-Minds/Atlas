import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { frameRoute, paddedCenter, routeFramePadding, selectionFramePadding } from '../routeFraming';

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

describe('routeFramePadding measured from the card (Live)', () => {
  const rect = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right });

  it('frames below a phone card that sits at the top (the 506 cars were under it)', () => {
    // Live's card on a 390x844 phone: 68px down to 382px, full width.
    expect(routeFramePadding(fakeMap(390, 844), 'left', { phoneSheet: true, card: rect(68, 382, 21, 357) }))
      .toEqual({ top: 406, bottom: 24, left: 45, right: 45 });
  });

  it('frames above a phone card that is a bottom sheet', () => {
    expect(routeFramePadding(fakeMap(390, 844), 'left', { card: rect(500, 844, 0, 390) }))
      .toEqual({ top: 75, bottom: 368, left: 45, right: 45 });
  });

  it('always leaves some map when the card fills nearly the whole phone screen', () => {
    const p = routeFramePadding(fakeMap(390, 844), 'left', { card: rect(68, 800, 21, 357) });
    expect(844 - (p.top ?? 0) - (p.bottom ?? 0)).toBeGreaterThanOrEqual(120);
  });

  it('clears the card\'s right edge on wide screens, never less than the regular padding', () => {
    expect(routeFramePadding(fakeMap(1280, 800), 'left', { card: rect(68, 382, 133, 413) }))
      .toEqual({ top: 80, bottom: 80, left: 437, right: 80 });
    expect(routeFramePadding(fakeMap(1280, 800), 'left', { card: rect(68, 382, 20, 200) }))
      .toEqual({ top: 80, bottom: 80, left: 320, right: 80 });
  });

  it('falls back to the regular padding with no card', () => {
    expect(routeFramePadding(fakeMap(390, 844), 'left', { phoneSheet: true, card: null })).toEqual(routeFramePadding(fakeMap(390, 844), 'left', { phoneSheet: true }));
  });
});

describe('frameRoute with a minimum zoom (Live place list)', () => {
  it('lands at least at the minimum zoom, centred for the padding', () => {
    const map = fakeMap() as ReturnType<typeof fakeMap> & { cameraForBounds: ReturnType<typeof vi.fn> };
    map.cameraForBounds = vi.fn(() => ({ center: [-79.4, 43.7] as [number, number], zoom: 8.1 }));
    const padding = { top: 10, bottom: 10, left: 10, right: 10 };
    expect(frameRoute(map, [[-79.6, 43.5], [-79.2, 43.9]], { minZoom: 9.2, padding })).toBe(true);
    expect(map.cameraForBounds).toHaveBeenCalledWith([[-79.6, 43.5], [-79.2, 43.9]], { padding, maxZoom: 14 });
    // The place's middle sits in the middle of the padded area (equal padding: the plain middle).
    const [{ center, zoom }] = map.flyTo.mock.calls[0] as [{ center: [number, number]; zoom: number }];
    expect(zoom).toBe(9.2);
    expect(center[0]).toBeCloseTo(-79.4, 6);
    expect(center[1]).toBeCloseTo(43.7, 6);
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});

describe('paddedCenter', () => {
  it('moves the centre so the point sits in the middle of the padded area', () => {
    expect(paddedCenter([-79.4, 43.7], 10, { top: 0, bottom: 0, left: 0, right: 0 })[0]).toBeCloseTo(-79.4, 9);
    // A card on top (big top padding): the centre moves north of the point, so the point shows lower down.
    const [lon, lat] = paddedCenter([-79.4, 43.7], 10, { top: 400, bottom: 24, left: 45, right: 45 });
    expect(lon).toBeCloseTo(-79.4, 9);
    expect(lat).toBeGreaterThan(43.7);
  });
});
