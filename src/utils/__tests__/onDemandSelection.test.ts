import { describe, expect, it } from 'vitest';
import { namedOnDemandService, onDemandCardName, resolveOnDemandLinkTarget, resolveSelectedOnDemandSlug } from '../onDemandSelection';

const area = { type: 'FeatureCollection', features: [] };
const agencies = [
  // HSR-style: fixed routes plus an on-demand area whose name shares the agency's prefix.
  { slug: 'hamilton', onDemandServiceArea: area },
  { slug: 'hamilton-transit-link', onDemandOnly: true, onDemandServiceArea: area },
  { slug: 'ttc' },
];

describe('resolveSelectedOnDemandSlug (#1073)', () => {
  it('selecting an agency that has an on-demand area but fixed routes opens the agency card, not the on-demand card', () => {
    expect(resolveSelectedOnDemandSlug(null, 'hamilton', agencies)).toBeNull();
  });

  it('does not match a similarly named on-demand-only agency by prefix', () => {
    expect(resolveSelectedOnDemandSlug(null, 'hamilton', agencies)).not.toBe('hamilton-transit-link');
  });

  it('selecting an on-demand-only agency still opens its on-demand card', () => {
    expect(resolveSelectedOnDemandSlug(null, 'hamilton-transit-link', agencies)).toBe('hamilton-transit-link');
  });

  it('an explicit on-demand selection wins, with or without a zone, even beside an agency selection', () => {
    expect(resolveSelectedOnDemandSlug('hamilton', null, agencies)).toBe('hamilton');
    expect(resolveSelectedOnDemandSlug('hamilton::zone-1', 'hamilton', agencies)).toBe('hamilton');
  });

  it('plain agencies and no selection resolve to nothing', () => {
    expect(resolveSelectedOnDemandSlug(null, 'ttc', agencies)).toBeNull();
    expect(resolveSelectedOnDemandSlug(null, null, agencies)).toBeNull();
    expect(resolveSelectedOnDemandSlug(null, undefined, agencies)).toBeNull();
  });
});

describe('on-demand link targets (#1440)', () => {
  // Hamilton's shape: myRide is the agency's service; three shaded zones are Trans-Cab. Grande Prairie's Late Night
  // is a stop-only service whose one zone entry has the service's own name.
  const zone = (areaName: string) => ({ properties: { areaName } });
  const hamilton = {
    serviceName: 'myRide Waterdown On-Demand',
    serviceHours: 'Mon–Fri 5 AM–1:30 AM',
    bookingInfo: 'Book in the myRide app.',
    features: [zone('Lower East Stoney Creek'), zone('Lower North Stoney Creek'), zone('West Glanbrook')],
    stopFeatures: [{ properties: { areaName: 'West Glanbrook' } }, { properties: { stopName: 'myRide stop' } }],
    zoneMetadata: {
      'Lower East Stoney Creek': { serviceName: 'Trans-Cab' },
      'Lower North Stoney Creek': { serviceName: 'Trans-Cab' },
      'West Glanbrook': { serviceName: 'Trans-Cab' },
    },
  };
  const grandePrairie = {
    serviceName: 'GP Transit On-Demand',
    features: [zone('Zone 1')],
    zoneMetadata: { 'Late Night On-Demand': { serviceName: 'Late Night On-Demand' } },
  };

  it('keeps a plain agency link on the main service', () => {
    expect(resolveOnDemandLinkTarget(hamilton, null)).toEqual({ kind: 'service' });
    expect(onDemandCardName(hamilton, null, 'HSR')).toBe('myRide Waterdown On-Demand');
  });

  it('opens a zone named in the link', () => {
    expect(resolveOnDemandLinkTarget(hamilton, 'West Glanbrook')).toEqual({ kind: 'zone', zoneId: 'West Glanbrook' });
    expect(onDemandCardName(hamilton, 'West Glanbrook', 'HSR')).toBe('Trans-Cab — West Glanbrook');
  });

  it('opens a separately run service with all of its zones', () => {
    const target = resolveOnDemandLinkTarget(hamilton, 'Trans-Cab');
    expect(target).toEqual({ kind: 'named-service', serviceName: 'Trans-Cab', zoneIds: ['Lower East Stoney Creek', 'Lower North Stoney Creek', 'West Glanbrook'] });
    expect(onDemandCardName(hamilton, 'Trans-Cab', 'HSR')).toBe('Trans-Cab');
  });

  it("builds that service's card from its own data, never the main service's", () => {
    const transCab = namedOnDemandService(hamilton, 'Trans-Cab', ['West Glanbrook']);
    expect(transCab.serviceName).toBe('Trans-Cab');
    expect(transCab.features).toHaveLength(1);
    expect(transCab.stopFeatures).toHaveLength(1);
    expect((transCab as { serviceHours?: string }).serviceHours).toBeUndefined();
    expect((transCab as { bookingInfo?: string }).bookingInfo).toBeUndefined();
  });

  it('lets a zone win when a zone and a service share a name, and names a stop-only service once', () => {
    expect(resolveOnDemandLinkTarget(grandePrairie, 'Late Night On-Demand')).toEqual({ kind: 'zone', zoneId: 'Late Night On-Demand' });
    expect(onDemandCardName(grandePrairie, 'Late Night On-Demand', 'GP')).toBe('Late Night On-Demand');
  });

  it('falls back to the main service for an id it does not know', () => {
    expect(resolveOnDemandLinkTarget(hamilton, 'Nowhere')).toEqual({ kind: 'service' });
  });
});
