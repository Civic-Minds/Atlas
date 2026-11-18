import { readFileSync } from 'fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PAGE_BACKGROUND, TIER_COLOURS } from './rules/colours';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_WIDTH, frameTiles, renderLinesPng, worldPixel, type DrawnLine } from './shareImage';

function decode(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  let i = 8; const idat: Buffer[] = [];
  while (i < png.length) {
    const len = png.readUInt32BE(i), type = png.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = (x: number, y: number) => [...raw.subarray(y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3)];
  return { width, height, px };
}
const hex = (n: number[]) => `#${n.map(v => v.toString(16).padStart(2, '0')).join('')}`;

describe('drawn link-preview picture (CIV-1393)', () => {
  it('uses the page colour the app uses', () => {
    const css = readFileSync('src/styles/index.css', 'utf8');
    expect(css.match(/:root\s*{[^}]*?--bg-app:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase()).toBe(PAGE_BACKGROUND);
  });

  it('is a 1200×630 PNG, plain page colour with no lines', () => {
    const { width, height, px } = decode(renderLinesPng([]));
    expect([width, height]).toEqual([SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT]);
    expect(hex(px(0, 0))).toBe(PAGE_BACKGROUND);
    expect(hex(px(600, 315))).toBe(PAGE_BACKGROUND);
  });

  it('draws the best tier on top, with nothing drawn at the centre unless a line is there (no marker)', () => {
    const lines: DrawnLine[] = [
      { colour: TIER_COLOURS[4], width: 6, rank: 60, points: new Float32Array([0, 100, 1200, 100]) },
      { colour: TIER_COLOURS[0], width: 6, rank: 10, points: new Float32Array([600, 0, 600, 630]) },
    ];
    const { px } = decode(renderLinesPng(lines));
    expect(hex(px(600, 100))).toBe(TIER_COLOURS[0]);
    expect(hex(px(100, 100))).toBe(TIER_COLOURS[4]);
    expect(hex(px(300, 300))).toBe(PAGE_BACKGROUND);
    expect(hex(px(601, 315))).toBe(TIER_COLOURS[0]);
  });

  it('frames the spot in the middle of the picture', () => {
    const tiles = frameTiles(43.6532, -79.3832);
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    expect(tiles.length).toBeLessThanOrEqual(20);
    const c = worldPixel(43.6532, -79.3832);
    const tilePx = 256 * 2 ** 0.7;
    const inFrame = tiles.some(t => c.x >= t.x * tilePx && c.x < (t.x + 1) * tilePx && c.y >= t.y * tilePx && c.y < (t.y + 1) * tilePx);
    expect(inFrame).toBe(true);
  });
});
