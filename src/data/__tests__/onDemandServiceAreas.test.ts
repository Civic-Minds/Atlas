import { describe, expect, it } from 'vitest';
import { BWG_ON_DEMAND_AGENCY, BWG_ON_DEMAND_SERVICE_AREA } from '../onDemandServiceAreas';

describe('BWG on-demand service area', () => {
  it('keeps the captured Argo polygon closed and non-trivial', () => {
    const ring = BWG_ON_DEMAND_SERVICE_AREA.geometry.coordinates[0];
    expect(ring.length).toBe(40);
    expect(ring[0]).toEqual(ring.at(-1));
    expect(new Set(ring.slice(0, -1).map(point => point.join(','))).size).toBe(39);
  });

  it('retains agency and source metadata for the map overlay', () => {
    expect(BWG_ON_DEMAND_AGENCY.slug).toBe('bwg');
    expect(BWG_ON_DEMAND_AGENCY.onDemandOnly).toBe(true);
    expect(BWG_ON_DEMAND_AGENCY.onDemandServiceArea.sourceUrl).toBe(
      'https://www.rideargo.com/cities/bwg#scroll-offset',
    );
    expect(BWG_ON_DEMAND_SERVICE_AREA.properties?.serviceType).toBe('on-demand');
  });
});
