import { describe, expect, it, vi } from 'vitest';
import { createMapExport, MAP_EXPORT_HEIGHT, MAP_EXPORT_WIDTH } from '../mapExport';

describe('createMapExport', () => {
  it('creates the fixed landscape export size with a branded composition', async () => {
    const context = {
      fillStyle: '',
      font: '',
      textBaseline: '',
      textAlign: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,atlas');
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })));

    const source = document.createElement('canvas');
    Object.defineProperty(source, 'width', { value: 100 });
    Object.defineProperty(source, 'height', { value: 100 });
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
    expect(context.fillText).toHaveBeenCalledWith('Night service', 28, 30);
  });

  it('keeps the export dimensions platform-neutral', () => {
    expect(MAP_EXPORT_WIDTH).toBe(1600);
    expect(MAP_EXPORT_HEIGHT).toBe(900);
  });
});
