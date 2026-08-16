import maplibregl from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { R2_PUBLIC_URL } from '../../shared/config';
import { agencyGeoWeekVersion } from './agencyGeo';
import { RetryingFetchSource } from './pmtilesRetrySource';

function atlasPmtilesUrl(): string {
  return `${R2_PUBLIC_URL}/atlas.pmtiles?v=${agencyGeoWeekVersion()}`;
}

const protocol = new Protocol();
let protocolRegistered = false;
export function registerProtocol() {
  if (!protocolRegistered) {
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
  // Register our retry-wrapped PMTiles instance under this exact URL so
  // MapLibre's `pmtiles://${url}/{z}/{x}/{y}` requests resolve to it instead
  // of a fresh stock instance (Protocol.get() matches by exact source key).
  protocol.add(new PMTiles(new RetryingFetchSource(atlasPmtilesUrl())));
}

export const getMapStyle = (lightMode: boolean): maplibregl.StyleSpecification => {
  const lightTiles = [
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  ];
  const darkTiles = [
    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
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
      'atlas-pmtiles': {
        type: 'vector',
        url: `pmtiles://${atlasPmtilesUrl()}`,
      },
    },
    layers: [
      { id: 'basemap-light', type: 'raster', source: 'cartodb-light', layout: { visibility: lightVis } },
      { id: 'basemap-dark', type: 'raster', source: 'cartodb-dark', layout: { visibility: darkVis } },
    ],
  };
};
