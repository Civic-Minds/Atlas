import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { R2_PUBLIC_URL } from '../../shared/config';
import { agencyGeoWeekVersion } from './agencyGeo';

let protocolRegistered = false;
export function registerProtocol() {
  if (!protocolRegistered) {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    protocolRegistered = true;
  }
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
        url: `pmtiles://${R2_PUBLIC_URL}/atlas.pmtiles?v=${agencyGeoWeekVersion()}`,
      },
    },
    layers: [
      { id: 'basemap-light', type: 'raster', source: 'cartodb-light', layout: { visibility: lightVis } },
      { id: 'basemap-dark', type: 'raster', source: 'cartodb-dark', layout: { visibility: darkVis } },
    ],
  };
};
