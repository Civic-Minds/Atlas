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

/** A style's tile URL: CARTO directly in builds, the dev server's key route under `npm run dev`. */
export const cartoTiles = (style: 'light_all' | 'dark_all', dev = import.meta.env.DEV): string[] => [dev
  ? `/api/carto-tiles?style=${style}&z={z}&x={x}&y={y}`
  : `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(CARTO_KEY)}`];
