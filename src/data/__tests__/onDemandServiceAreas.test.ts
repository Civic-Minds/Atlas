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
  CYRIDE_EASE_SERVICE_AREA,
  EDMONTON_ON_DEMAND_SERVICE_AREA,
  MUSKOKA_DRT_ON_DEMAND_AGENCY,
  ST_ALBERT_ON_DEMAND_AGENCY,
  LEAMINGTON_LT_GO_ON_DEMAND_AGENCY,
  METRO_MICRO_SERVICE_AREA,
  WATA_PARATRANSIT_SERVICE_AREA,
  UTA_ON_DEMAND_SERVICE_AREA,
} from '../onDemandServiceAreas';
import { HSR_MY_RIDE_STOP_FEATURES } from '../hsrMyRideStops';
import { HAMILTON_TRANS_CAB_SERVICE_AREAS, HAMILTON_TRANS_CAB_TRANSFER_POINTS } from '../transCabServiceArea';
import { isOnDemandActive, isOnDemandStopShown, isOnDemandZoneShown, onDemandPickupSentence } from '../../../shared/onDemandAvailability';

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
    expect(GRT_ROUTE_79_SERVICE_AREA.tripRules).toContain('start or end in Breslau');
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
    expect(METRO_MICRO_SERVICE_AREA.features).toHaveLength(4);
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

describe('CyRide EASE on-demand service area', () => {
  it('keeps the agency-supplied EASE polygon closed and tied to City Hall', () => {
    expect(CYRIDE_EASE_SERVICE_AREA.features).toHaveLength(1);
    const ring = CYRIDE_EASE_SERVICE_AREA.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(13);
    expect(ring[0]).toEqual(ring.at(-1));
    expect(CYRIDE_EASE_SERVICE_AREA.stopFeatures.map(stop => stop.properties?.stopId)).toEqual(['5102284']);
  });

  it('only shows EASE during its weekday operating window', () => {
    expect(isOnDemandActive(CYRIDE_EASE_SERVICE_AREA.availability, 'Weekday', 'midday')).toBe(true);
    expect(isOnDemandActive(CYRIDE_EASE_SERVICE_AREA.availability, 'Weekday', 'overnight')).toBe(false);
    expect(isOnDemandActive(CYRIDE_EASE_SERVICE_AREA.availability, 'Saturday', 'midday')).toBe(false);
  });
});

describe('Muskoka District DRT on-demand service area', () => {
  it('keeps the District Phase 1.2 polygon closed and beta-only', () => {
    expect(MUSKOKA_DRT_ON_DEMAND_AGENCY.betaOnly).toBe(true);
    expect(MUSKOKA_DRT_ON_DEMAND_AGENCY.onDemandOnly).toBe(true);
    const ring = MUSKOKA_DRT_ON_DEMAND_AGENCY.onDemandServiceArea.features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(72);
    expect(ring[0]).toEqual(ring.at(-1));
  });

  it('only shows District DRT on weekdays 7 a.m.–7 p.m.', () => {
    const { availability } = MUSKOKA_DRT_ON_DEMAND_AGENCY.onDemandServiceArea;
    expect(isOnDemandActive(availability, 'Weekday', 'midday')).toBe(true);
    expect(isOnDemandActive(availability, 'Weekday', 'overnight')).toBe(false);
    expect(isOnDemandActive(availability, 'Saturday', 'midday')).toBe(false);
  });
});

describe('St. Albert on-demand service area', () => {
  it('keeps the agency Flex zone closed and beta-only', () => {
    expect(ST_ALBERT_ON_DEMAND_AGENCY.betaOnly).toBe(true);
    const ring = ST_ALBERT_ON_DEMAND_AGENCY.onDemandServiceArea.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring.at(-1));
  });

  it('follows the Flex service windows: weekday evenings and Sunday daytime', () => {
    const { availability } = ST_ALBERT_ON_DEMAND_AGENCY.onDemandServiceArea;
    expect(isOnDemandActive(availability, 'Weekday', 'midday')).toBe(false);
    expect(isOnDemandActive(availability, 'Weekday', 'late')).toBe(true);
    expect(isOnDemandActive(availability, 'Sunday', 'midday')).toBe(true);
  });
});

describe('Leamington LT-Go on-demand stops', () => {
  it('keeps all 118 published stops and no inferred zone', () => {
    expect(LEAMINGTON_LT_GO_ON_DEMAND_AGENCY.onDemandServiceArea.features).toHaveLength(0);
    expect(LEAMINGTON_LT_GO_ON_DEMAND_AGENCY.onDemandServiceArea.stopFeatures).toHaveLength(118);
  });
});

describe('Hamilton on-demand services stay separate', () => {
  it('labels every shaded zone Trans-Cab only, never combined with myRide', () => {
    expect(HAMILTON_MY_RIDE_SERVICE_AREA.serviceName).toBe('myRide Waterdown On-Demand');
    for (const zone of HAMILTON_MY_RIDE_SERVICE_AREA.features) {
      const areaName = (zone.properties as { areaName: string }).areaName;
      expect(HAMILTON_MY_RIDE_SERVICE_AREA.zoneMetadata[areaName].serviceName).toBe('Trans-Cab');
    }
    const names = [HAMILTON_MY_RIDE_SERVICE_AREA.serviceName, ...Object.values(HAMILTON_MY_RIDE_SERVICE_AREA.zoneMetadata).map(zone => zone.serviceName)];
    expect(names.some(name => name.includes(' and '))).toBe(false);
  });
});

describe('UTA On Demand zones', () => {
  it('gives every zone polygon its own hours', () => {
    expect(UTA_ON_DEMAND_SERVICE_AREA.features).toHaveLength(8);
    for (const zone of UTA_ON_DEMAND_SERVICE_AREA.features) {
      const areaName = (zone.properties as { areaName: string }).areaName;
      expect(UTA_ON_DEMAND_SERVICE_AREA.zoneMetadata[areaName as keyof typeof UTA_ON_DEMAND_SERVICE_AREA.zoneMetadata].availability).toBeDefined();
    }
  });

  it('hides weekday-only zones on Sunday', () => {
    expect(isOnDemandActive(UTA_ON_DEMAND_SERVICE_AREA.zoneMetadata['Tooele County'].availability, 'Sunday', 'midday')).toBe(false);
    expect(isOnDemandActive(UTA_ON_DEMAND_SERVICE_AREA.zoneMetadata['Salt Lake City Westside'].availability, 'Sunday', 'midday')).toBe(true);
  });
});

describe('Edmonton On Demand areas', () => {
  it('keeps every area closed and only claims hours where the City publishes them', () => {
    expect(EDMONTON_ON_DEMAND_SERVICE_AREA.features.length).toBe(99);
    for (const area of EDMONTON_ON_DEMAND_SERVICE_AREA.features) {
      const ring = area.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
    }
    expect(EDMONTON_ON_DEMAND_SERVICE_AREA.zoneMetadata['Keswick'].availability?.Weekday).toEqual([]);
    expect(EDMONTON_ON_DEMAND_SERVICE_AREA.zoneMetadata['Glenora East'].availability).toBeUndefined();
  });
});

describe('Hamilton Trans-Cab hours and transfer points', () => {
  it('runs Trans-Cab zones on their published hours, including after midnight', () => {
    for (const zone of HAMILTON_TRANS_CAB_SERVICE_AREAS) {
      const areaName = (zone.properties as { areaName: string }).areaName;
      expect(isOnDemandZoneShown(HAMILTON_MY_RIDE_SERVICE_AREA, areaName, 'Saturday', 'midday')).toBe(true);
      expect(isOnDemandZoneShown(HAMILTON_MY_RIDE_SERVICE_AREA, areaName, 'Saturday', 'late')).toBe(true);
      expect(isOnDemandZoneShown(HAMILTON_MY_RIDE_SERVICE_AREA, areaName, 'Weekday', 'overnight')).toBe(false);
    }
  });

  it('ties each transfer point to the zone it serves and hides it with that zone', () => {
    expect(HAMILTON_TRANS_CAB_TRANSFER_POINTS.map(point => point.properties?.areaName)).toEqual(['Lower North Stoney Creek', 'West Glanbrook']);
    expect(isOnDemandStopShown(HAMILTON_MY_RIDE_SERVICE_AREA, HAMILTON_TRANS_CAB_TRANSFER_POINTS[0].properties, 'Weekday', 'overnight')).toBe(false);
  });

  it('shows myRide stops on myRide hours, independent of Trans-Cab zones', () => {
    expect(isOnDemandStopShown(HAMILTON_MY_RIDE_SERVICE_AREA, HSR_MY_RIDE_STOP_FEATURES[0].properties, 'Weekday', 'late')).toBe(true);
    expect(isOnDemandStopShown(HAMILTON_MY_RIDE_SERVICE_AREA, HSR_MY_RIDE_STOP_FEATURES[0].properties, 'Weekday', 'overnight')).toBe(false);
  });
});

describe('GRT Route 79 connection areas', () => {
  it('keeps every Route 79 area on the weekday-only schedule', () => {
    for (const zone of GRT_ROUTE_79_SERVICE_AREAS) {
      const areaName = (zone.properties as { areaName: string }).areaName;
      expect(isOnDemandZoneShown(GRT_ROUTE_79_SERVICE_AREA, areaName, 'Saturday', 'midday')).toBe(false);
      expect(isOnDemandZoneShown(GRT_ROUTE_79_SERVICE_AREA, areaName, 'Weekday', 'amPeak')).toBe(true);
    }
  });

  it('labels only the Kitchener areas as connection points', () => {
    expect(onDemandPickupSentence(GRT_ROUTE_79_SERVICE_AREA, 'Route 204 iXpress Connection')).toBe('This area is a connection point.');
    expect(onDemandPickupSentence(GRT_ROUTE_79_SERVICE_AREA, 'GRT Breslau')).toBeNull();
  });
});

describe('on-demand pickup methods stated by agencies', () => {
  it('describes Muskoka as curb to curb, St. Albert as set stops, and Leamington by its drawn stops', () => {
    expect(onDemandPickupSentence(MUSKOKA_DRT_ON_DEMAND_AGENCY.onDemandServiceArea, undefined)).toContain('curb to curb');
    expect(onDemandPickupSentence(ST_ALBERT_ON_DEMAND_AGENCY.onDemandServiceArea, 'St. Albert')).not.toContain('shown on the map');
    expect(onDemandPickupSentence(LEAMINGTON_LT_GO_ON_DEMAND_AGENCY.onDemandServiceArea, undefined)).toBe('Pickups and drop-offs are at 118 set stops, shown on the map.');
  });

  it('keeps booking details out of the hours text', () => {
    for (const service of [CYRIDE_EASE_SERVICE_AREA, MUSKOKA_DRT_ON_DEMAND_AGENCY.onDemandServiceArea, LEAMINGTON_LT_GO_ON_DEMAND_AGENCY.onDemandServiceArea]) {
      expect(service.serviceHours).not.toMatch(/book|call/i);
      expect(service.bookingInfo).toMatch(/call/);
    }
  });
});

describe('Hamilton pickup methods from hamilton.ca', () => {
  it('describes Trans-Cab trips as to or from a transfer point and myRide as set stops', () => {
    expect(onDemandPickupSentence(HAMILTON_MY_RIDE_SERVICE_AREA, 'West Glanbrook')).toBe("Every trip starts or ends at this zone's transfer point, shown on the map.");
    expect(onDemandPickupSentence(HAMILTON_MY_RIDE_SERVICE_AREA, 'Lower East Stoney Creek')).toBe('Every trip starts or ends at a transfer point.');
    expect(onDemandPickupSentence(HAMILTON_MY_RIDE_SERVICE_AREA, undefined)).toMatch(/^Pickups and drop-offs are at \d+ set stops, shown on the map\.$/);
  });
});

describe('on-demand data hygiene', () => {
  it('never draws placeholder zones', () => {
    expect(METRO_MICRO_SERVICE_AREA.features.some(zone => /placeholder/i.test(String((zone.properties as { areaName?: string } | null)?.areaName)))).toBe(false);
  });
});
