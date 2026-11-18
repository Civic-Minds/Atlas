import { deflateSync } from 'node:zlib';
import { PMTiles, FetchSource } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { PAGE_BACKGROUND } from './rules/colours.js';
import { featurePassesHeadwayFilter, routeFilterHeadway } from './routeHeadwayFilter.js';
import { headwayToTierColor } from '../src/utils/colors.js';

/**
 * A link-preview picture drawn for the exact spot in a shared map link (CIV-1393): Atlas's own frequency lines
 * (weekday AM peak, every 60 minutes or better, in their tier colours, the same view the city pictures show) on the
 * plain page colour, centred on the spot. No streets, no marker, no text. Read straight from the published PMTiles
 * archive (a few tiles by range request), so it needs no new data and no rebuild.
 */

export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;
/** The city pictures' scale: 1200 px across at web-map zoom 11.7 (512 px tiles), i.e. 12.7 in 256 px tile terms. */
const VIEW_ZOOM = 12.7;
const TILE_ZOOM = 12;
const VIEW = { period: 'amPeak', day: 'Weekday', maxHeadway: 60 } as const;
/** Line widths in output pixels, wider for the more frequent tiers so the picture reads at thumbnail size. */
const WIDTH_BEST = 5;
const WIDTH_OTHER = 3.6;

export interface DrawnLine { colour: string; width: number; rank: number; points: Float32Array }

const TILE_PX = 256 * 2 ** (VIEW_ZOOM - TILE_ZOOM);
/** World pixels at the view's zoom. */
const WORLD_PX = 256 * 2 ** VIEW_ZOOM;

export function worldPixel(lat: number, lon: number): { x: number; y: number } {
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * WORLD_PX, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * WORLD_PX };
}

/** The tiles a frame centred on a spot touches. */
export function frameTiles(lat: number, lon: number): { z: number; x: number; y: number }[] {
  const c = worldPixel(lat, lon);
  const left = c.x - SHARE_IMAGE_WIDTH / 2, top = c.y - SHARE_IMAGE_HEIGHT / 2;
  const n = 2 ** TILE_ZOOM;
  const out: { z: number; x: number; y: number }[] = [];
  for (let ty = Math.floor(top / TILE_PX); ty <= Math.floor((top + SHARE_IMAGE_HEIGHT) / TILE_PX); ty++) {
    for (let tx = Math.floor(left / TILE_PX); tx <= Math.floor((left + SHARE_IMAGE_WIDTH) / TILE_PX); tx++) {
      if (ty >= 0 && ty < n) out.push({ z: TILE_ZOOM, x: ((tx % n) + n) % n, y: ty });
    }
  }
  return out;
}

/** The lines one tile contributes, in frame pixels, for the lines that pass the view's filter. */
export function tileLines(data: ArrayBuffer | Uint8Array, tile: { z: number; x: number; y: number }, lat: number, lon: number): DrawnLine[] {
  const layer = new VectorTile(new PbfReader(data instanceof Uint8Array ? data : new Uint8Array(data))).layers.routes;
  if (!layer) return [];
  const c = worldPixel(lat, lon);
  const left = c.x - SHARE_IMAGE_WIDTH / 2, top = c.y - SHARE_IMAGE_HEIGHT / 2;
  const lines: DrawnLine[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.type !== 2) continue;
    const props = f.properties as Record<string, unknown>;
    if (props.day != null && props.day !== VIEW.day) continue;
    if (!featurePassesHeadwayFilter(props, VIEW.period, VIEW.maxHeadway)) continue;
    const headway = routeFilterHeadway(props, VIEW.period);
    const colour = headwayToTierColor(headway);
    const rank = headway ?? 999;
    for (const part of f.loadGeometry()) {
      const pts = new Float32Array(part.length * 2);
      part.forEach((p, k) => {
        pts[k * 2] = (tile.x * TILE_PX + (p.x / layer.extent) * TILE_PX) - left;
        pts[k * 2 + 1] = (tile.y * TILE_PX + (p.y / layer.extent) * TILE_PX) - top;
      });
      lines.push({ colour, width: rank <= 15 ? WIDTH_BEST : WIDTH_OTHER, rank, points: pts });
    }
  }
  return lines;
}

/** Fetches and decodes the frame's tiles from a PMTiles archive. */
export async function frameLines(archiveUrl: string, lat: number, lon: number): Promise<DrawnLine[]> {
  const archive = new PMTiles(new FetchSource(archiveUrl));
  const tiles = frameTiles(lat, lon);
  const parts = await Promise.all(tiles.map(async tile => {
    const got = await archive.getZxy(tile.z, tile.x, tile.y);
    return got ? tileLines(got.data, tile, lat, lon) : [];
  }));
  return parts.flat();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Draws the lines (least frequent first, so the best sit on top) as anti-aliased capsules and encodes a PNG. */
export function renderLinesPng(lines: readonly DrawnLine[], width = SHARE_IMAGE_WIDTH, height = SHARE_IMAGE_HEIGHT): Buffer {
  const rgb = new Float32Array(width * height * 3);
  const [br, bg, bb] = hexToRgb(PAGE_BACKGROUND);
  for (let i = 0; i < width * height; i++) { rgb[i * 3] = br; rgb[i * 3 + 1] = bg; rgb[i * 3 + 2] = bb; }
  const ordered = [...lines].sort((a, b) => b.rank - a.rank);
  for (const line of ordered) {
    const [r, g, b] = hexToRgb(line.colour);
    const half = line.width / 2;
    const p = line.points;
    for (let s = 0; s + 3 < p.length; s += 2) {
      const x0 = p[s], y0 = p[s + 1], x1 = p[s + 2], y1 = p[s + 3];
      const minX = Math.max(0, Math.floor(Math.min(x0, x1) - half - 1)), maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + half + 1));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1) - half - 1)), maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + half + 1));
      if (minX > maxX || minY > maxY) continue;
      const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
          const d = Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
          const a = Math.max(0, Math.min(1, half + 0.5 - d));
          if (a <= 0) continue;
          const o = (y * width + x) * 3;
          rgb[o] += (r - rgb[o]) * a; rgb[o + 1] += (g - rgb[o + 1]) * a; rgb[o + 2] += (b - rgb[o + 2]) * a;
        }
      }
    }
  }
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width * 3; x++) raw[y * (width * 3 + 1) + 1 + x] = Math.round(rgb[y * width * 3 + x]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))]);
}
