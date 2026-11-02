import type { StyleSpecification } from 'maplibre-gl';

/**
 * The CARTO basemap. CARTO's terms allow its tiles only straight from CARTO to the browser, never proxied or cached on a
 * server (CIV-980). Ryan's basemap key is public by design: CARTO serves it only to transitatlas.fyi and its subdomains,
 * so it sits in the tile URLs. localhost is not on that list, so local dev loads tiles through the dev server's
 * /api/carto-tiles route (local-api/carto-tiles.ts, never deployed) with the server key.
 */
const PUBLIC_CARTO_KEY = 'cb1_4vgm_1_bddf0dba122b55aa0ea4293a';
const CARTO_KEY = import.meta.env.VITE_CARTO_BASEMAP_KEY || PUBLIC_CARTO_KEY;

/** The basemap's full credit line: the map's hover, MapLibre's attribution and image exports. */
export const BASEMAP_ATTRIBUTION = 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';

/** CARTO's light and dark basemaps, with place names (`_all`, the main map) or without (`_nolabels`, the Frequent story, CIV-1168). */
export type CartoStyle = 'light_all' | 'dark_all' | 'light_nolabels' | 'dark_nolabels';

/** A style's tile URL: CARTO directly in builds, the dev server's key route under `npm run dev`. */
export const cartoTiles = (style: CartoStyle, dev = import.meta.env.DEV): string[] => [dev
  ? `/api/carto-tiles?style=${style}&z={z}&x={x}&y={y}`
  : `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`];

/**
 * The basemap as a MapLibre style: a light and a dark CARTO layer, one visible at a time for the theme (switch with
 * `setLayoutProperty`). Every map in Atlas starts from this; `labels: false` leaves out place names (CIV-1168).
 */
export function basemapStyle(lightMode: boolean, { labels = true }: { labels?: boolean } = {}): StyleSpecification {
  const kind = labels ? 'all' : 'nolabels';
  return {
    version: 8,
    sources: {
      'cartodb-light': { type: 'raster', tiles: cartoTiles(`light_${kind}`), tileSize: 256, attribution: BASEMAP_ATTRIBUTION },
      'cartodb-dark': { type: 'raster', tiles: cartoTiles(`dark_${kind}`), tileSize: 256, attribution: BASEMAP_ATTRIBUTION },
    },
    layers: [
      { id: 'basemap-light', type: 'raster', source: 'cartodb-light', layout: { visibility: lightMode ? 'visible' : 'none' } },
      { id: 'basemap-dark', type: 'raster', source: 'cartodb-dark', layout: { visibility: lightMode ? 'none' : 'visible' } },
    ],
  };
}
