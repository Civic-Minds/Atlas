import { describe, expect, it } from 'vitest';
import { stampWorstDirectionHeadways } from '../worst-direction.js';
import type { GeoJsonFeature } from '../geojson-types.js';

function feat(
  routeShortName: string,
  day: string,
  directionId: number,
  headway: number,
  headwayByPeriod?: Record<string, number>,
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
});
