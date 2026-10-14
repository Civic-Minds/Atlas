import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSavedView, parseUrlView } from '../regionView';

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('parseUrlView (#846)', () => {
  it('reads a valid share link', () => {
    expect(parseUrlView(new URLSearchParams('lat=43.67&lon=-79.39&z=11'))).toEqual({ lat: 43.67, lon: -79.39, zoom: 11 });
  });

  it('ignores a latitude outside -90..90 so the default view opens', () => {
    expect(parseUrlView(new URLSearchParams('lat=91&lon=181&z=0'))).toBeUndefined();
    expect(parseUrlView(new URLSearchParams('lat=-95&lon=0&z=3'))).toBeUndefined();
  });

  it('ignores missing or non-numeric values', () => {
    expect(parseUrlView(new URLSearchParams('lat=43&lon=-79'))).toBeUndefined();
    expect(parseUrlView(new URLSearchParams('lat=abc&lon=1&z=2'))).toBeUndefined();
  });

  it('keeps longitudes and zooms MapLibre already handles', () => {
    expect(parseUrlView(new URLSearchParams('lat=10&lon=500&z=-3'))).toEqual({ lat: 10, lon: 500, zoom: -3 });
  });
});

describe('getSavedView', () => {
  it('drops a saved view with an impossible latitude', () => {
    localStorage.setItem('atlas_view', JSON.stringify({ lat: 120, lon: 0, zoom: 5 }));
    expect(getSavedView()).toBeNull();
  });
});
