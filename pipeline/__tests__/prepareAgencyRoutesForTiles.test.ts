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
      // The nested copy stays in the agency JSON; tiles carry only the flat keys below.
      expect(f.properties?.worstDirectionHeadwayByPeriod).toBeUndefined();
      // Flat tile keys used by MapLibre period filter
      expect(f.properties?.wdph_midday).toBe(10);
    }
  });

  it('derives legacy full-window coverage from max-gap data before building tiles', () => {
    const features = [
      lineFeat({
        routeShortName: '95', day: 'Weekday', directionId: 0, tier: 'regular', headway: 12,
        headwayByPeriod: { evening: 12, overnight: null },
        maxGapByPeriod: { evening: 12, overnight: 177 },
      }),
      lineFeat({
        routeShortName: '95', day: 'Weekday', directionId: 1, tier: 'regular', headway: 12,
        headwayByPeriod: { evening: 12, overnight: null },
        maxGapByPeriod: { evening: 12, overnight: 207 },
      }),
    ];

    const routes = prepareAgencyRouteFeaturesForTiles(features, 'ttc');
    expect(routes[0].properties?.wdpch_overnight).toBe(207);
    expect(routes[0].properties?.hph_overnight).toBe(999999);
    expect(routes[1].properties?.wdpch_overnight).toBe(207);
  });
});

describe('CIV-1579: the trunk value flattens to tv_, as rv_ does (shadow, nothing reads it)', () => {
  it('routeTrunkHeadwayByPeriod becomes tv_<period>; null is the no-service sentinel; rv_ is unchanged', () => {
    const [f] = prepareAgencyRouteFeaturesForTiles([lineFeat({
      routeShortName: '901', day: 'Weekday', directionId: 0, tier: '30', headway: 30,
      routeFilterHeadwayByPeriod: { amPeak: 30, midday: 30, overnight: null },
      routeTrunkHeadwayByPeriod: { amPeak: 10, midday: 10, overnight: null },
      trunkStopMask: '1*18,*6',
    })], 'drt');
    expect(f.properties?.tv_amPeak).toBe(10);
    expect(f.properties?.tv_midday).toBe(10);
    expect(f.properties?.tv_overnight).toBe(999999);
    expect(f.properties?.rv_midday).toBe(30);
    expect(f.properties?.rv_overnight).toBe(999999);
    // The nested maps and the stop mask stay in the agency JSON.
    expect(f.properties?.routeTrunkHeadwayByPeriod).toBeUndefined();
    expect(f.properties?.trunkStopMask).toBeUndefined();
  });
  it('a route without the trunk field gets no tv_ keys', () => {
    const [f] = prepareAgencyRouteFeaturesForTiles([lineFeat({ routeShortName: '1', day: 'Weekday', directionId: 0, tier: '15', headway: 15, routeFilterHeadwayByPeriod: { midday: 15 } })], 'x');
    expect(Object.keys(f.properties ?? {}).filter(k => k.startsWith('tv_'))).toEqual([]);
    expect(f.properties?.rv_midday).toBe(15);
  });
});
