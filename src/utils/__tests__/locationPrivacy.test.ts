import { describe, expect, it } from 'vitest';
import { urlView, urlViewDecimals } from '../regionView';
import { withoutMapPosition } from '../../lib/analytics';
import { MAP_URL, linkUpdate } from '../urlSchema';

// #1519: after "locate me" the map view is the visitor's own position. The address bar kept it to
// five decimal places (about 1 m) and sent it to page analytics and the feedback email.
describe('the map view in the address keeps only what its zoom needs (#1519)', () => {
  it('two places below zoom 11, three below 15, four from 15', () => {
    expect(urlViewDecimals(9)).toBe(2);
    expect(urlViewDecimals(12.5)).toBe(3);
    expect(urlViewDecimals(16)).toBe(4);
  });

  it('writes the rounded view, never five places', () => {
    const write = (lat: number, lon: number, zoom: number) => linkUpdate({ lat: MAP_URL.lat, lon: MAP_URL.lon, zoom: MAP_URL.zoom }, urlView(lat, lon, zoom));
    expect(write(43.654321, -79.387654, 10)).toMatchObject({ lat: '43.65', lon: '-79.39' });
    expect(write(43.654321, -79.387654, 13)).toMatchObject({ lat: '43.654', lon: '-79.388' });
    expect(write(43.654321, -79.387654, 17.25)).toMatchObject({ lat: '43.6543', lon: '-79.3877', z: '17.25' });
  });
});

describe('analytics and the feedback email get the address without lat and lon (#1519)', () => {
  it('drops lat and lon, keeps the rest', () => {
    expect(withoutMapPosition('https://transitatlas.fyi/?lat=43.65432&lon=-79.38765&z=16.00&route=ttc%3A%3A504'))
      .toBe('https://transitatlas.fyi/?z=16.00&route=ttc%3A%3A504');
    expect(withoutMapPosition('https://transitatlas.fyi/about')).toBe('https://transitatlas.fyi/about');
  });
});
