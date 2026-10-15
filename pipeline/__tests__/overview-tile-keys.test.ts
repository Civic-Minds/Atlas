import { describe, expect, it } from 'vitest';
import { buildOverviewRoutes } from '../build-pmtiles';

describe('overview tiles keep the keys their filter reads (#899)', () => {
  it('keeps worstDirectionMiddayCap, so a capped route also fails the all-day filter at z<=7', () => {
    const [route] = buildOverviewRoutes([{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[-79.4, 43.7], [-79.3, 43.8]] },
      properties: { agencySlug: 'x', routeId: '1', worstDirectionHeadway: 20, worstDirectionMiddayCap: 999999, directionMiddayWait: null, stopOrder: ['a'] },
    } as any]);
    expect(route.properties).toMatchObject({ worstDirectionHeadway: 20, worstDirectionMiddayCap: 999999 });
    expect(route.properties).not.toHaveProperty('stopOrder');
  });
});
