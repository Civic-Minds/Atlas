import { describe, expect, it } from 'vitest';
import { liveRouteColours } from '../liveRouteColours';
import { localRouteHeadwayColor } from '../../components/Interval/map/routeStyle';
import { routeFilterHeadway } from '../../../shared/routeHeadwayFilter';
import { periodKeyForHour } from '../../../shared/config';

// CIV-2191: Studio Live's lines take the main map's colour for the period it is now, from the map's own reading.
const shape = (routeShortName: string, pmPeak: number): GeoJSON.Feature => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  properties: { routeId: routeShortName, directionId: 0, tier: '10', headway: 10, routeShortName, headwayByPeriod: { midday: 10, pmPeak } },
});

describe('Live route colours from the main map (CIV-2191)', () => {
  const HOUR = 17; // PM peak
  const period = periodKeyForHour(HOUR)!;
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      shape('501', 6),
      shape('501', 12),
      shape('506', 25),
      shape('999', 5),
    ],
  };

  it("colours each route as the main map reads it this period, its most frequent shape winning", () => {
    const colours = liveRouteColours(fc, ['501', '506'], HOUR, 'default');
    expect(routeFilterHeadway(fc.features[0].properties!, period)).toBe(6);
    expect(colours.get('501')).toBe(localRouteHeadwayColor(6, 'default'));
    expect(colours.get('501')).not.toBe(localRouteHeadwayColor(25, 'default'));
    expect(colours.get('506')).toBe(localRouteHeadwayColor(routeFilterHeadway(fc.features[2].properties!, period), 'default'));
    expect(colours.has('999')).toBe(false);
  });

  it('follows the colour-vision setting', () => {
    const colours = liveRouteColours(fc, ['506'], HOUR, 'friendly');
    expect(colours.get('506')).toBe(localRouteHeadwayColor(routeFilterHeadway(fc.features[2].properties!, period), 'friendly'));
  });

  it('leaves every route grey before the shapes load', () => {
    expect(liveRouteColours(undefined, ['501'], HOUR, 'default').size).toBe(0);
  });
});
