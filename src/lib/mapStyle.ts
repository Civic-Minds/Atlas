import * as maplibregl from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { R2_PUBLIC_URL } from '../../shared/config';
import { currentAgencyDataVersion, resolveAgencyDataVersion } from './agencyGeo';
import { RetryingFetchSource } from './pmtilesRetrySource';
import { dataReleaseApiUrl, dataReleaseAssetUrl, resolveDataRelease, type DataRelease } from './dataRelease';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 locates its worker at runtime via `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`, which bundlers can't see — production builds never emit the
// file, the SPA rewrite serves index.html instead, and no vector tiles render
// (same failure as #426). Hand it a Vite-bundled worker URL explicitly.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

let activeRelease: DataRelease | null = null;

export function getAtlasPmtilesUrl(): string {
  if (activeRelease) {
    if (typeof window !== 'undefined' && import.meta.env.PROD) {
      return `${window.location.origin}${dataReleaseApiUrl(activeRelease.releaseId)}`;
    }
    return dataReleaseAssetUrl(activeRelease, activeRelease.pmtilesKey);
  }
  // Keep deployed requests same-origin and expose the range headers PMTiles needs.
  const browserUrl = typeof window !== 'undefined' && import.meta.env.PROD
    ? `${window.location.origin}/api/atlas-pmtiles`
    : `${R2_PUBLIC_URL}/atlas.pmtiles`;
  return `${browserUrl}?v=${currentAgencyDataVersion()}`;
}

export function getAtlasOverviewPmtilesUrl(): string {
  if (activeRelease) {
    if (typeof window !== 'undefined' && import.meta.env.PROD) {
      return `${window.location.origin}${dataReleaseApiUrl(activeRelease.releaseId, 'overview')}`;
    }
    return dataReleaseAssetUrl(activeRelease, activeRelease.overviewPmtilesKey);
  }
  const browserUrl = typeof window !== 'undefined' && import.meta.env.PROD
    ? `${window.location.origin}/api/atlas-pmtiles?variant=overview`
    : `${R2_PUBLIC_URL}/atlas-overview.pmtiles`;
  return `${browserUrl}${browserUrl.includes('?') ? '&' : '?'}v=${currentAgencyDataVersion()}`;
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
  const lightTiles = [
    '/api/carto-tiles?style=light_all&z={z}&x={x}&y={y}',
  ];
  const darkTiles = [
    '/api/carto-tiles?style=dark_all&z={z}&x={x}&y={y}',
  ];
  const lightVis = lightMode ? 'visible' : 'none';
  const darkVis = lightMode ? 'none' : 'visible';

  return {
    version: 8,
    sources: {
      'cartodb-light': {
        type: 'raster',
        tiles: lightTiles,
        tileSize: 256,
        attribution: 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
      },
      'cartodb-dark': {
        type: 'raster',
        tiles: darkTiles,
        tileSize: 256,
        attribution: 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
      },
    },
    layers: [
      { id: 'basemap-light', type: 'raster', source: 'cartodb-light', layout: { visibility: lightVis } },
      { id: 'basemap-dark', type: 'raster', source: 'cartodb-dark', layout: { visibility: darkVis } },
    ],
  };
};
