import { describe, expect, it } from 'vitest';
import { stampWorstDirectionHeadways, stampRouteIrregularDirection } from '../worst-direction.js';
import type { GeoJsonFeature } from '../geojson-types.js';

function feat(
  routeShortName: string,
  day: string,
  directionId: number,
  headway: number,
  headwayByPeriod?: Record<string, number>,
  tier?: string,
  headwayByPeriodSustained?: Record<string, boolean>,
): GeoJsonFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    properties: {
      routeShortName,
      day,
      directionId,
      headway,
      ...(headwayByPeriod ? { headwayByPeriod } : {}),
      ...(headwayByPeriodSustained ? { headwayByPeriodSustained } : {}),
      ...(tier !== undefined ? { tier } : {}),
    },
  };
}

describe('stampWorstDirectionHeadways', () => {
  it('uses worst direction within the same day only', () => {
    const features = [
      feat('15', 'Weekday', 0, 60),
      feat('15', 'Weekday', 1, 45),
      feat('15', 'Saturday', 0, 90),
      feat('15', 'Saturday', 1, 90),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadway).toBe(60);
    expect(features[1].properties.worstDirectionHeadway).toBe(60);
    expect(features[2].properties.worstDirectionHeadway).toBe(90);
    expect(features[3].properties.worstDirectionHeadway).toBe(90);
  });

  it('stamps worst period headways per day', () => {
    const features = [
      feat('15', 'Weekday', 0, 60, { midday: 60 }),
      feat('15', 'Weekday', 1, 45, { midday: 45 }),
      feat('15', 'Saturday', 0, 90, { midday: 90 }),
    ];
    stampWorstDirectionHeadways(features);

    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 60 });
    expect(features[2].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 90 });
  });

  it('ignores sparse short-turn branch when same direction has frequent primary service', () => {
    const features = [
      feat('63', 'Weekday', 0, 10, { midday: 10 }, '10', { midday: true }),
      feat('63', 'Weekday', 1, 10, { midday: 10 }, '10', { midday: true }),
      feat('63', 'Weekday', 1, 175, { midday: 175 }, 'infrequent', { midday: false }),
    ];
    stampWorstDirectionHeadways(features);
    expect(features[0].properties.worstDirectionHeadway).toBe(10);
    expect(features[0].properties.worstDirectionHeadwayByPeriod).toEqual({ midday: 10 });
  });
});

describe('stampRouteIrregularDirection', () => {
  it('flags every feature of a route+day when one whole direction has no real-tier pattern (Halifax 330)', () => {
    const features = [
      feat('330', 'Weekday', 0, undefined as unknown as number, undefined, 'span'), // Westbound: entirely span
      feat('330', 'Weekday', 1, 13, undefined, 'infrequent'), // Eastbound: real, just infrequent tier
    ];
    stampRouteIrregularDirection(features);

    expect(features[0].properties.routeHasIrregularDirection).toBe(true);
    expect(features[1].properties.routeHasIrregularDirection).toBe(true);
  });

  it('does not flag a direction that has a real pattern alongside a minor span pattern (Kingston 701)', () => {
    const features = [
      feat('701', 'Weekday', 0, 15, undefined, '30'), // via Brock/Bath: real
      feat('701', 'Weekday', 1, 30, undefined, '60'), // via Downtown: real
      feat('701', 'Weekday', 1, undefined as unknown as number, undefined, 'span'), // Express - Downtown: minor span pattern, same direction
    ];
    stampRouteIrregularDirection(features);

    expect(features[0].properties.routeHasIrregularDirection).toBeUndefined();
    expect(features[1].properties.routeHasIrregularDirection).toBeUndefined();
    expect(features[2].properties.routeHasIrregularDirection).toBeUndefined();
  });

  it('does not flag other routes sharing a day', () => {
    const features = [
      feat('330', 'Weekday', 0, undefined as unknown as number, undefined, 'span'),
      feat('330', 'Weekday', 1, 13, undefined, 'infrequent'),
      feat('40', 'Weekday', 0, 30, undefined, '30'),
      feat('40', 'Weekday', 1, 30, undefined, '30'),
    ];
    stampRouteIrregularDirection(features);

    expect(features[2].properties.routeHasIrregularDirection).toBeUndefined();
    expect(features[3].properties.routeHasIrregularDirection).toBeUndefined();
  });
});
