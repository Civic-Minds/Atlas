import { describe, expect, it } from 'vitest';
import { BASEMAP_ATTRIBUTION, basemapStyle, cartoTiles } from '../basemap';

describe('basemap tiles (CIV-980)', () => {
  it('loads CARTO tiles straight from CARTO with the public key in builds, never through /api', () => {
    for (const style of ['light_all', 'dark_all'] as const) {
      expect(cartoTiles(style, false)).toEqual([`https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=cb1_4vgm_1_bddf0dba122b55aa0ea4293a`]);
    }
  });
  it('goes through the dev server under npm run dev, where localhost is not on the key', () => {
    expect(cartoTiles('dark_all', true)).toEqual(['/api/carto-tiles?style=dark_all&z={z}&x={x}&y={y}']);
  });
  it('keeps the full credit line', () => {
    expect(BASEMAP_ATTRIBUTION).toBe('Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.');
  });
  it('builds the one basemap style, with place names by default and without them for the Frequent story (CIV-1168)', () => {
    const tiles = (style: ReturnType<typeof basemapStyle>) => Object.values(style.sources).map(s => (s as { tiles: string[] }).tiles[0]);
    expect(tiles(basemapStyle(true)).map(t => t.match(/rastertiles\/(\w+)\//)?.[1] ?? t.match(/style=(\w+)/)?.[1])).toEqual(['light_all', 'dark_all']);
    expect(tiles(basemapStyle(false, { labels: false })).map(t => t.match(/rastertiles\/(\w+)\//)?.[1] ?? t.match(/style=(\w+)/)?.[1])).toEqual(['light_nolabels', 'dark_nolabels']);
    expect(basemapStyle(false).layers.map(l => [l.id, (l.layout as { visibility: string }).visibility])).toEqual([['basemap-light', 'none'], ['basemap-dark', 'visible']]);
  });
});
