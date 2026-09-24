import { describe, expect, it } from 'vitest';
import {
  BWG_ON_DEMAND_AGENCY,
  BWG_ON_DEMAND_SERVICE_AREA,
  CALEDON_ON_DEMAND_AGENCY,
  CALEDON_ON_DEMAND_SERVICE_AREAS,
  BRAMPTON_ON_DEMAND_AGENCY,
  BRAMPTON_ON_DEMAND_SERVICE_AREAS,
  GRT_ROUTE_79_SERVICE_AREAS,
  GRT_ROUTE_79_SERVICE_AREA,
  HAMILTON_MY_RIDE_SERVICE_AREA,
} from '../onDemandServiceAreas';
import { HSR_MY_RIDE_STOP_FEATURES } from '../hsrMyRideStops';

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

  it('keeps Caledon as three closed service-area polygons', () => {
    expect(CALEDON_ON_DEMAND_AGENCY.slug).toBe('caledon');
    expect(CALEDON_ON_DEMAND_SERVICE_AREAS).toHaveLength(3);
    for (const area of CALEDON_ON_DEMAND_SERVICE_AREAS) {
      const ring = area.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
    }
  });

  it('keeps Brampton Downtown as a closed service-area polygon', () => {
    expect(BRAMPTON_ON_DEMAND_AGENCY.slug).toBe('brampton-argo');
    const ring = BRAMPTON_ON_DEMAND_SERVICE_AREAS[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring.at(-1));
  });

  it('keeps the four GRT Route 79 submission polygons closed and labelled', () => {
    expect(GRT_ROUTE_79_SERVICE_AREAS).toHaveLength(4);
    expect(GRT_ROUTE_79_SERVICE_AREA.serviceName).toBe('Route 79 Breslau On-Demand');
    for (const area of GRT_ROUTE_79_SERVICE_AREAS) {
      const ring = area.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
      expect(area.properties?.agencySlug).toBe('grt');
      expect(area.properties?.areaName).toBeTruthy();
    }
  });

  it('keeps HSR myRide as stop data without inventing a service boundary', () => {
    expect(HAMILTON_MY_RIDE_SERVICE_AREA.features).toHaveLength(0);
    expect(HAMILTON_MY_RIDE_SERVICE_AREA.stopFeatures).toBe(HSR_MY_RIDE_STOP_FEATURES);
    expect(HSR_MY_RIDE_STOP_FEATURES).toHaveLength(138);
    expect(HSR_MY_RIDE_STOP_FEATURES.every(feature => feature.geometry.type === 'Point')).toBe(true);
  });

});
