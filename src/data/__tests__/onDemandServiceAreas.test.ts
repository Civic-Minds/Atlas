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
  C_TRAN_CURRENT_SERVICE_AREA,
  METRO_MICRO_SERVICE_AREA,
  WATA_PARATRANSIT_SERVICE_AREA,
} from '../onDemandServiceAreas';
import { HSR_MY_RIDE_STOP_FEATURES } from '../hsrMyRideStops';
import { HAMILTON_TRANS_CAB_SERVICE_AREAS, HAMILTON_TRANS_CAB_TRANSFER_POINTS } from '../transCabServiceArea';
import { isOnDemandActive } from '../../../shared/onDemandAvailability';

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

  it('filters Argo services to their published operating windows', () => {
    expect(isOnDemandActive(BRAMPTON_ON_DEMAND_AGENCY.onDemandServiceArea.availability, 'Weekday', 'evening')).toBe(true);
    expect(isOnDemandActive(BRAMPTON_ON_DEMAND_AGENCY.onDemandServiceArea.availability, 'Weekday', 'late')).toBe(false);
    expect(isOnDemandActive(BRAMPTON_ON_DEMAND_AGENCY.onDemandServiceArea.availability, 'Weekday', 'overnight')).toBe(false);
    expect(isOnDemandActive(BRAMPTON_ON_DEMAND_AGENCY.onDemandServiceArea.availability, 'Saturday', 'midday')).toBe(false);
    expect(isOnDemandActive(CALEDON_ON_DEMAND_AGENCY.onDemandServiceArea.availability, 'Sunday', 'pmPeak')).toBe(true);
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

  it('keeps Hamilton myRide stops and Trans-Cab boundaries as separate source-backed data', () => {
    expect(HAMILTON_TRANS_CAB_SERVICE_AREAS).toHaveLength(3);
    for (const area of HAMILTON_TRANS_CAB_SERVICE_AREAS) {
      expect(area.geometry.coordinates[0][0]).toEqual(area.geometry.coordinates[0].at(-1));
    }
    expect(HAMILTON_TRANS_CAB_TRANSFER_POINTS).toHaveLength(2);
    expect(HAMILTON_MY_RIDE_SERVICE_AREA.features).toBe(HAMILTON_TRANS_CAB_SERVICE_AREAS);
    expect(HAMILTON_MY_RIDE_SERVICE_AREA.stopFeatures?.slice(0, 138)).toEqual(HSR_MY_RIDE_STOP_FEATURES);
    expect(HAMILTON_MY_RIDE_SERVICE_AREA.stopFeatures?.slice(138)).toEqual(HAMILTON_TRANS_CAB_TRANSFER_POINTS);
    expect(HSR_MY_RIDE_STOP_FEATURES).toHaveLength(138);
    expect(HSR_MY_RIDE_STOP_FEATURES.every(feature => feature.geometry.type === 'Point')).toBe(true);
  });

  it('keeps the published Metro micro Flex zones source-backed', () => {
    expect(METRO_MICRO_SERVICE_AREA.features).toHaveLength(5);
    expect(METRO_MICRO_SERVICE_AREA.sourceUrl).toBe('https://svc.metrotransit.org/mtgtfs/gtfs-flex.zip');
    const northMinneapolis = METRO_MICRO_SERVICE_AREA.zoneMetadata?.['North Minneapolis Area'];
    expect(northMinneapolis?.serviceHours).toBe('Weekdays: 5:30 a.m.–10:30 p.m.; Saturday: 7:00 a.m.–10:30 p.m.; Sunday: 7:00 a.m.–10:30 p.m.');
    expect(isOnDemandActive(northMinneapolis?.availability, 'Weekday', 'amPeak')).toBe(true);
    expect(isOnDemandActive(northMinneapolis?.availability, 'Saturday', 'amPeak')).toBe(true);
    expect(isOnDemandActive(northMinneapolis?.availability, 'Sunday', 'overnight')).toBe(false);
    expect(METRO_MICRO_SERVICE_AREA.features.every(feature => feature.geometry.type === 'MultiPolygon' || feature.geometry.type === 'Polygon')).toBe(true);
  });

  it('keeps The Current service areas and virtual stops source-backed', () => {
    expect(C_TRAN_CURRENT_SERVICE_AREA.features).toHaveLength(7);
    expect(C_TRAN_CURRENT_SERVICE_AREA.stopFeatures).toHaveLength(27);
    expect(C_TRAN_CURRENT_SERVICE_AREA.sourceUrl).toBe('https://www.c-tran.com/images/Google/TheCurrent_GTFSFlex.zip');
  });

  it('keeps WATA paratransit geometry and hours sourced from its Flex feed', () => {
    expect(WATA_PARATRANSIT_SERVICE_AREA.features).toHaveLength(1);
    expect(WATA_PARATRANSIT_SERVICE_AREA.sourceUrl).toBe(
      'https://data.trilliumtransit.com/gtfs/williamsburg-va-us/williamsburg-va-us--flex-v2.zip',
    );
    expect(WATA_PARATRANSIT_SERVICE_AREA.serviceName).toBe('Paratransit');
    expect(WATA_PARATRANSIT_SERVICE_AREA.serviceHours).toBe(
      'Weekdays: 6:00 a.m.–9:00 p.m.; Saturday: 6:00 a.m.–9:00 p.m.; Sunday: 8:00 a.m.–6:00 p.m.',
    );
    expect(isOnDemandActive(WATA_PARATRANSIT_SERVICE_AREA.availability, 'Sunday', 'amPeak')).toBe(true);
    expect(isOnDemandActive(WATA_PARATRANSIT_SERVICE_AREA.availability, 'Sunday', 'overnight')).toBe(false);
    expect(WATA_PARATRANSIT_SERVICE_AREA.features[0].geometry.type).toBe('Polygon');
  });

});
