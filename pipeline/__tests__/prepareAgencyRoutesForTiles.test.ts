import { describe, expect, it } from 'vitest';
import { prepareAgencyRouteFeaturesForTiles } from '../prepareAgencyRoutesForTiles.js';

function lineFeat(props: Record<string, unknown>) {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    properties: { ...props },
  };
}

describe('prepareAgencyRouteFeaturesForTiles', () => {
  it('re-stamps worst-direction before flattening (TTC 63-style published 175)', () => {
    const features = [
      lineFeat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 0,
        tier: '10',
        headway: 10,
        headwayByPeriod: { midday: 10 },
        headwayByPeriodSustained: { midday: true },
        // Stale published stamp including rare short-turn
        worstDirectionHeadwayByPeriod: { midday: 175 },
        worstDirectionHeadway: 175,
      }),
      lineFeat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 1,
        tier: '10',
        headway: 10,
        headwayByPeriod: { midday: 10 },
        headwayByPeriodSustained: { midday: true },
        worstDirectionHeadwayByPeriod: { midday: 175 },
        worstDirectionHeadway: 175,
      }),
      lineFeat({
        routeShortName: '63',
        day: 'Weekday',
        directionId: 1,
        tier: 'infrequent',
        headway: 175,
        headwayByPeriod: { midday: 175 },
        headwayByPeriodSustained: { midday: false },
        worstDirectionHeadwayByPeriod: { midday: 175 },
        worstDirectionHeadway: 175,
      }),
    ];

    const routes = prepareAgencyRouteFeaturesForTiles(features, 'ttc');
    expect(routes).toHaveLength(3);
    for (const f of routes) {
      expect(f.properties?.agencySlug).toBe('ttc');
      expect(f.properties?.worstDirectionHeadway).toBe(10);
      expect(f.properties?.worstDirectionHeadwayByPeriod).toEqual({ midday: 10 });
      // Flat tile keys used by MapLibre period filter
      expect(f.properties?.wdph_midday).toBe(10);
    }
  });
});
