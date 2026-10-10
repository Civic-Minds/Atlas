import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMapExport,
  getMapExportLayout,
  MAP_EXPORT_HEIGHT,
  MAP_EXPORT_SIZES,
  MAP_EXPORT_WIDTH,
  MapExportBlockedError,
  mapExportFilename,
  waitForMapExportReady,
  wrapExportLine,
  type MapExportReadinessTarget,
} from '../mapExport';

function mockCanvasContext() {
  const context = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    textAlign: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,atlas');
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));
  return context;
}

function sourceCanvas(width: number, height: number) {
  const source = document.createElement('canvas');
  Object.defineProperty(source, 'width', { value: width });
  Object.defineProperty(source, 'height', { value: height });
  return source;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createMapExport', () => {
  it('creates the fixed landscape export size with a branded composition', async () => {
    const context = mockCanvasContext();
    const source = sourceCanvas(100, 100);
    const blob = await createMapExport({ source, title: 'Night service', lightMode: true });

    expect(blob.type).toBe('image/png');
    expect(context.drawImage).toHaveBeenCalledWith(
      source,
      0,
      25.3125,
      100,
      49.375,
      0,
      72,
      MAP_EXPORT_WIDTH,
      MAP_EXPORT_HEIGHT - 72 - 38,
    );
    expect(context.fillText).toHaveBeenCalledWith('Night service', 28, 34);
  });

  it('draws the whole phone screen without cropping or stretching it', async () => {
    const context = mockCanvasContext();
    const source = sourceCanvas(1170, 2532);
    await createMapExport({ source, title: 'Transit Frequency', lightMode: true });

    const [, sx, sy, sw, sh, , , dw, dh] = vi.mocked(context.drawImage).mock.calls[0] as unknown as number[];
    expect([sx, sy, sw, sh]).toEqual([0, 0, 1170, 2532]);
    expect(dw).toBeLessThanOrEqual(1170);
    expect(dh).toBeLessThanOrEqual(2532);
    expect(Math.abs(dw / dh - 1170 / 2532)).toBeLessThan(0.002);
  });

  it('draws the place, filter lines and colour key', async () => {
    const context = mockCanvasContext();
    const source = sourceCanvas(1600, 1000);
    await createMapExport({
      source,
      title: 'Toronto',
      lines: ['Transit frequency', 'Every 20 min or better · Saturday midday'],
      key: [{ color: '#22863a', label: '≤10m' }, { color: '#f59e0b', label: '≤20m' }],
      keyTitle: 'Frequency',
      lightMode: true,
    });
    const texts = vi.mocked(context.fillText).mock.calls.map(call => call[0]);
    expect(texts).toEqual(expect.arrayContaining(['Toronto', 'Transit frequency', 'Every 20 min or better · Saturday midday', 'Frequency', '≤10m', '≤20m']));
    expect(texts.some(text => /[A-Z]{4,}/.test(String(text).replace(/CARTO|ODbL/g, '')))).toBe(false);
  });

  it('keeps the export dimensions platform-neutral', () => {
    expect(MAP_EXPORT_WIDTH).toBe(1600);
    expect(MAP_EXPORT_HEIGHT).toBe(900);
  });
});

describe('wrapExportLine', () => {
  const measure = (text: string) => text.length * 10;

  it('wraps between filter parts instead of cutting text off', () => {
    expect(wrapExportLine(measure, 'Every 20 min or better · Saturday midday', 250)).toEqual(['Every 20 min or better', 'Saturday midday']);
  });

  it('keeps every word when one part is wider than the image', () => {
    const lines = wrapExportLine(measure, 'Route 505 Dundas West to Broadview Station', 150);
    expect(lines.join(' ')).toBe('Route 505 Dundas West to Broadview Station');
    expect(lines.every(line => measure(line) <= 150)).toBe(true);
  });
});

describe('mapExportFilename', () => {
  it('uses lowercase letters, numbers and dashes only', () => {
    expect(mapExportFilename('atlas-montréal-20min-saturday-midday.png')).toBe('atlas-montreal-20min-saturday-midday.png');
    expect(mapExportFilename('  ')).toBe('atlas-map.png');
  });
});

describe('getMapExportLayout', () => {
  it('grows the header to fit the description lines', () => {
    expect(getMapExportLayout(2880, 1800, MAP_EXPORT_SIZES[1], 3).headerHeight).toBeGreaterThan(getMapExportLayout(2880, 1800).headerHeight);
  });

  it('keeps text readable on a narrow phone image', () => {
    const layout = getMapExportLayout(390, 844, MAP_EXPORT_SIZES[2], 2);
    expect(layout.scale).toBeLessThan(1);
    expect(layout.height).toBe(layout.headerHeight + layout.mapRect.height + layout.footerHeight);
  });

  it('keeps the preset size for landscape screens', () => {
    const layout = getMapExportLayout(2880, 1800);
    expect(layout.width).toBe(1600);
    expect(layout.height).toBe(900);
    expect(layout.stackedFooter).toBe(false);
  });

  it('matches a portrait screen shape for every preset and never upscales', () => {
    for (const size of MAP_EXPORT_SIZES) {
      for (const [w, h] of [[1170, 2532], [780, 1688], [390, 844]]) {
        const layout = getMapExportLayout(w, h, size);
        expect(layout.height).toBeGreaterThan(layout.width);
        expect(layout.sourceRect).toEqual({ x: 0, y: 0, width: w, height: h });
        expect(layout.mapRect.width).toBeLessThanOrEqual(w);
        expect(layout.mapRect.height).toBeLessThanOrEqual(h);
        expect(Math.abs(layout.mapRect.width / layout.mapRect.height - w / h)).toBeLessThan(0.005);
        expect(layout.height).toBe(layout.headerHeight + layout.mapRect.height + layout.footerHeight);
      }
    }
  });

  it('uses the full screen resolution when the preset would be larger', () => {
    const layout = getMapExportLayout(390, 844, MAP_EXPORT_SIZES[2]);
    expect(layout.mapRect.width).toBe(390);
    expect(layout.mapRect.height).toBe(844);
  });
});

function fakeMap(state: { loaded: boolean; tiles: boolean; moving?: boolean }) {
  let idleListener: (() => void) | null = null;
  const map: MapExportReadinessTarget = {
    loaded: () => state.loaded,
    areTilesLoaded: () => state.tiles,
    isMoving: () => state.moving ?? false,
    triggerRepaint: () => {
      setTimeout(() => {
        const listener = idleListener;
        idleListener = null;
        listener?.();
      }, 10);
    },
    once: (_type, listener) => {
      idleListener = listener;
    },
    off: () => {
      idleListener = null;
    },
  };
  return map;
}

describe('waitForMapExportReady', () => {
  it('waits for route data and map tiles before resolving', async () => {
    vi.useFakeTimers();
    const state = { loaded: false, tiles: false };
    let dataLoading = true;
    let resolved = false;
    const promise = waitForMapExportReady({
      map: fakeMap(state),
      isDataLoading: () => dataLoading,
      hasRenderedRoutes: () => true,
    }).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(resolved).toBe(false);
    dataLoading = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(resolved).toBe(false);
    state.loaded = true;
    state.tiles = true;
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(resolved).toBe(true);
  });

  it('gives up with a plain message instead of hanging forever', async () => {
    vi.useFakeTimers();
    const promise = waitForMapExportReady({
      map: fakeMap({ loaded: false, tiles: false }),
      isDataLoading: () => true,
      hasRenderedRoutes: () => true,
      timeoutMs: 5000,
    });
    const assertion = expect(promise).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(6000);
    await assertion;
  });

  it('refuses to export a loaded view with no routes drawn', async () => {
    vi.useFakeTimers();
    const promise = waitForMapExportReady({
      map: fakeMap({ loaded: true, tiles: true }),
      isDataLoading: () => false,
      hasRenderedRoutes: () => false,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(MapExportBlockedError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    await expect(promise).rejects.toMatchObject({ reason: 'no-routes' });
  });

  it('refuses to export when some route data failed to load', async () => {
    await expect(waitForMapExportReady({
      map: fakeMap({ loaded: true, tiles: true }),
      isDataLoading: () => false,
      hasFailedData: () => true,
      hasRenderedRoutes: () => true,
    })).rejects.toMatchObject({ reason: 'failed-networks' });
  });
});
