import { describe, expect, it } from 'vitest';
import { compareSideBView, linkCompareMaps, type LinkableMap } from '../compareMapSync';

/** A fake map: jumpTo moves it and fires 'move' like MapLibre; pan() is the user dragging it. */
function fakeMap(lat: number, lng: number, zoom: number): LinkableMap & { pan(lat: number, lng: number, zoom?: number): void; listeners: number } {
  let c = { lat, lng };
  let z = zoom;
  const ls = new Set<() => void>();
  const m = {
    getCenter: () => c, getZoom: () => z, getBearing: () => 0, getPitch: () => 0,
    jumpTo: (o: { center: { lat: number; lng: number }; zoom: number }) => { c = o.center; z = o.zoom; ls.forEach(l => l()); },
    on: (_t: 'move', l: () => void) => { ls.add(l); },
    off: (_t: 'move', l: () => void) => { ls.delete(l); },
    pan(la: number, ln: number, zz = z) { c = { lat: la, lng: ln }; z = zz; ls.forEach(l => l()); },
    get listeners() { return ls.size; },
  };
  return m;
}

describe('linkCompareMaps', () => {
  it('snaps B to A on link, then pans both ways', () => {
    const a = fakeMap(43.65, -79.38, 11); const b = fakeMap(49.28, -123.12, 9);
    linkCompareMaps(a, b);
    expect(b.getCenter()).toEqual({ lat: 43.65, lng: -79.38 });
    expect(b.getZoom()).toBe(11);
    a.pan(45, -75, 12);
    expect(b.getCenter()).toEqual({ lat: 45, lng: -75 });
    expect(b.getZoom()).toBe(12);
    b.pan(46, -74, 10);
    expect(a.getCenter()).toEqual({ lat: 46, lng: -74 });
    expect(a.getZoom()).toBe(10);
  });

  it('unlinked, each map moves alone and A is never moved by B', () => {
    const a = fakeMap(43.65, -79.38, 11); const b = fakeMap(43.65, -79.38, 11);
    const unlink = linkCompareMaps(a, b);
    unlink();
    expect(a.listeners).toBe(0);
    expect(b.listeners).toBe(0);
    a.pan(45, -75, 12);
    expect(b.getCenter()).toEqual({ lat: 43.65, lng: -79.38 });
    b.pan(49.28, -123.12, 9);
    expect(a.getCenter()).toEqual({ lat: 45, lng: -75 });
    expect(a.getZoom()).toBe(12);
  });

  it('relinking snaps B to where A is (A leads), wherever B had gone', () => {
    const a = fakeMap(43.65, -79.38, 11); const b = fakeMap(43.65, -79.38, 11);
    linkCompareMaps(a, b)();
    b.pan(49.28, -123.12, 9);
    a.pan(45, -75, 12);
    linkCompareMaps(a, b);
    expect(b.getCenter()).toEqual({ lat: 45, lng: -75 });
    expect(b.getZoom()).toBe(12);
    expect(a.getCenter()).toEqual({ lat: 45, lng: -75 });
  });
});

describe('compareSideBView', () => {
  const A = { bounds: { s: 43, w: -80, n: 44, e: -79 }, zoom: 11 };
  const B = { bounds: { s: 49, w: -124, n: 50, e: -123 }, zoom: 9 };
  it('linked, B uses A, so nothing is loaded for B on its own', () => {
    expect(compareSideBView(true, A, B)).toEqual(A);
  });
  it('unlinked, B uses its own view and A is untouched', () => {
    expect(compareSideBView(false, A, B)).toEqual(B);
    expect(A.bounds.s).toBe(43);
  });
  it('unlinked before B has reported a view, falls back to A', () => {
    expect(compareSideBView(false, A, { bounds: null, zoom: undefined })).toEqual(A);
  });
});
