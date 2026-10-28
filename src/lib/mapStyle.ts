import * as maplibregl from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { R2_PUBLIC_URL } from '../../shared/config';
import { currentAgencyDataVersion, resolveAgencyDataVersion } from './agencyGeo';
import { RetryingFetchSource } from './pmtilesRetrySource';
import { BASEMAP_ATTRIBUTION, cartoTiles } from './basemap';
import { dataReleasePmtilesUrl, resolveDataRelease, verifiedReleaseRequired, type DataRelease } from './dataRelease';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 locates its worker at runtime via `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`, which bundlers can't see — production builds never emit the
// file, the SPA rewrite serves index.html instead, and no vector tiles render
// (same failure as #426). Hand it a Vite-bundled worker URL explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

let activeRelease: DataRelease | null = null;

/** The verified data release the map is drawing, or null when none loaded (e.g. local dev). */
export function getActiveDataRelease(): DataRelease | null {
  return activeRelease;
}

export function getAtlasPmtilesUrl(): string {
  // No verified release on a deployed build: the URL serves nothing, so the map draws no routes
  // rather than routes that disagree with the cards. Local development only falls back to the
  // root archive for unpublished previews.
  return dataReleasePmtilesUrl(activeRelease, 'detail', verifiedReleaseRequired())
    ?? `${R2_PUBLIC_URL}/atlas.pmtiles?v=${currentAgencyDataVersion()}`;
}

export function getAtlasOverviewPmtilesUrl(): string {
  return dataReleasePmtilesUrl(activeRelease, 'overview', verifiedReleaseRequired())
    ?? `${R2_PUBLIC_URL}/atlas-overview.pmtiles?v=${currentAgencyDataVersion()}`;
}

const protocol = new Protocol();
let protocolRegistered = false;

export async function registerProtocol() {
  activeRelease = await resolveDataRelease();
  await resolveAgencyDataVersion();
  if (!protocolRegistered) {
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
  // Register our retry-wrapped PMTiles instance under this exact URL so
  // MapLibre's `pmtiles://${url}/{z}/{x}/{y}` requests resolve to it instead
  // of a fresh stock instance (Protocol.get() matches by exact source key).
  protocol.add(new PMTiles(new RetryingFetchSource(getAtlasPmtilesUrl())));
  protocol.add(new PMTiles(new RetryingFetchSource(getAtlasOverviewPmtilesUrl())));
}

export const getMapStyle = (lightMode: boolean): maplibregl.StyleSpecification => {
  const lightTiles = cartoTiles('light_all');
  const darkTiles = cartoTiles('dark_all');
  const lightVis = lightMode ? 'visible' : 'none';
  const darkVis = lightMode ? 'none' : 'visible';

  return {
    version: 8,
    sources: {
      'cartodb-light': {
        type: 'raster',
        tiles: lightTiles,
        tileSize: 256,
        attribution: BASEMAP_ATTRIBUTION,
      },
      'cartodb-dark': {
        type: 'raster',
        tiles: darkTiles,
        tileSize: 256,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      { id: 'basemap-light', type: 'raster', source: 'cartodb-light', layout: { visibility: lightVis } },
      { id: 'basemap-dark', type: 'raster', source: 'cartodb-dark', layout: { visibility: darkVis } },
    ],
  };
};
