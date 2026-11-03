import { describe, expect, it } from 'vitest';
import { countNightRoutesInView, nightRoutesInView } from '../nightRoutesInView';

function line(coords: [number, number][], properties: Record<string, unknown>): GeoJSON.Feature {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties };
}

const downtown = { s: 43.64, w: -79.40, n: 43.67, e: -79.37 };

const layers: Record<string, GeoJSON.FeatureCollection> = {
  ttc: {
    type: 'FeatureCollection',
    features: [
      // Two directions of one downtown route count once.
      line([[-79.39, 43.65], [-79.38, 43.66]], { routeShortName: '304', routeLongName: 'King', nightService60: true, nightService30: true }),
      line([[-79.38, 43.66], [-79.39, 43.65]], { routeShortName: '304', routeLongName: 'King', nightService60: true, nightService30: true }),
      // Runs hourly at night: in the 60 view only.
      line([[-79.39, 43.655], [-79.385, 43.66]], { routeShortName: '320', routeLongName: 'Yonge', nightService60: true }),
      // The older flag counts in the 60 view.
      line([[-79.395, 43.65], [-79.375, 43.65]], { routeShortName: '310', routeLongName: 'Spadina', nightService: true }),
      // Night route out of view (Scarborough).
      line([[-79.25, 43.77], [-79.20, 43.78]], { routeShortName: '385', routeLongName: 'Sheppard East', nightService60: true }),
      // Daytime route in view.
      line([[-79.39, 43.65], [-79.38, 43.65]], { routeShortName: '504', routeLongName: 'King' }),
    ],
  },
  miway: {
    type: 'FeatureCollection',
    features: [line([[-79.64, 43.59], [-79.60, 43.60]], { routeShortName: '1', routeLongName: 'Dundas', nightService60: true })],
  },
};

describe('nightRoutesInView (#1233)', () => {
  it('counts each night route in view once, as the list groups them', () => {
    expect(countNightRoutesInView(layers, 60, downtown)).toEqual({ routes: 3, agencies: 1 });
    expect(countNightRoutesInView(layers, 30, downtown)).toEqual({ routes: 1, agencies: 1 });
  });

  it('counts routes from every agency in a wider view', () => {
    expect(countNightRoutesInView(layers, 60, { s: 43.5, w: -79.7, n: 43.8, e: -79.1 })).toEqual({ routes: 5, agencies: 2 });
  });

  it('counts nothing before the map reports its view', () => {
    expect(nightRoutesInView(layers, 60, null)).toEqual([]);
    expect(countNightRoutesInView(layers, 60, undefined)).toEqual({ routes: 0, agencies: 0 });
  });
});
