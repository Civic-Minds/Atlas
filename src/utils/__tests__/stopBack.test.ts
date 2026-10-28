import { describe, expect, it } from 'vitest';
import { resolveStopBack, stopBackTarget, type StopBackAgency, type StopBackRoute, type StopBackSnapshot } from '../stopBack';
import { agencyNames } from '../agencyName';

const snap = (over: Partial<StopBackSnapshot> = {}): StopBackSnapshot => ({
  route: null, agencySlug: null, onDemand: null, searchFocused: false, ...over,
});

const zoneArea = {
  serviceName: 'myRide',
  features: [{ properties: { areaName: 'Waterdown Area' } }, { properties: { areaName: 'Ancaster' } }],
  zoneMetadata: { Ancaster: { serviceName: 'Trans-Cab' } },
};

const agencies: StopBackAgency[] = [
  { slug: 'ttc', name: 'Toronto Transit Commission' },
  { slug: 'hsr', name: 'Hamilton Street Railway (HSR)', onDemandServiceArea: zoneArea },
  { slug: 'link', name: 'Example Link', onDemandOnly: true, onDemandServiceArea: { serviceName: 'Link On-Demand', features: [] } },
];

const routes: Record<string, StopBackRoute> = {
  'ttc::504': { routeShortName: '504', routeLongName: 'King' },
  'ttc::01': { routeShortName: '01', routeLongName: 'Line 1' },
  'ttc::blue': { routeShortName: '', routeLongName: 'Blue Line' },
};
const findRoute = (key: string) => routes[key] ?? null;

describe('stopBackTarget (CIV-832)', () => {
  it('no snapshot (keyboard, shared link) goes back to the map', () => {
    expect(stopBackTarget(null)).toEqual({ kind: 'map' });
  });
  it('nothing open goes back to the map', () => {
    expect(stopBackTarget(snap())).toEqual({ kind: 'map' });
  });
  it('a stop picked from search goes back to the map even with a card open', () => {
    expect(stopBackTarget(snap({ agencySlug: 'ttc', searchFocused: true }))).toEqual({ kind: 'map' });
  });
  it('an open route card wins', () => {
    expect(stopBackTarget(snap({ route: 'ttc::504', agencySlug: 'ttc' }))).toEqual({ kind: 'route', route: 'ttc::504' });
  });
  it('an open zone card comes before a plain agency selection', () => {
    expect(stopBackTarget(snap({ onDemand: 'hsr::Waterdown Area', agencySlug: 'ttc' }))).toEqual({ kind: 'onDemand', selection: 'hsr::Waterdown Area' });
  });
  it('an open agency card', () => {
    expect(stopBackTarget(snap({ agencySlug: 'ttc' }))).toEqual({ kind: 'agency', agencySlug: 'ttc' });
  });
});

describe('resolveStopBack (CIV-832)', () => {
  it('map reads "Map"', () => {
    expect(resolveStopBack({ kind: 'map' }, agencies, findRoute)).toEqual({ to: 'Map', target: { kind: 'map' } });
    expect(resolveStopBack(null, agencies, findRoute).to).toBe('Map');
  });
  it('agency uses the same short name as the route card\'s back link', () => {
    const back = resolveStopBack({ kind: 'agency', agencySlug: 'hsr' }, agencies, findRoute);
    expect(back.to).toBe(agencyNames('Hamilton Street Railway (HSR)').short);
    expect(back.target).toEqual({ kind: 'agency', agencySlug: 'hsr' });
  });
  it('an on-demand-only agency opens the on-demand card, so it uses that card\'s heading', () => {
    expect(resolveStopBack({ kind: 'agency', agencySlug: 'link' }, agencies, findRoute).to).toBe('Link On-Demand');
  });
  it('a zone uses the zone card\'s heading', () => {
    expect(resolveStopBack({ kind: 'onDemand', selection: 'hsr::Waterdown Area' }, agencies, findRoute).to).toBe('myRide — Waterdown');
    expect(resolveStopBack({ kind: 'onDemand', selection: 'hsr::Ancaster' }, agencies, findRoute).to).toBe('Trans-Cab — Ancaster');
    expect(resolveStopBack({ kind: 'onDemand', selection: 'hsr' }, agencies, findRoute).to).toBe('myRide');
  });
  it('a route reads "Route" plus its cleaned short name', () => {
    expect(resolveStopBack({ kind: 'route', route: 'ttc::504' }, agencies, findRoute).to).toBe('Route 504');
    expect(resolveStopBack({ kind: 'route', route: 'ttc::01' }, agencies, findRoute).to).toBe('Route 1');
  });
  it('a route with no short name uses the route card\'s title', () => {
    expect(resolveStopBack({ kind: 'route', route: 'ttc::blue' }, agencies, findRoute).to).toBe('Blue Line');
  });
  it('falls back to the map when the target can no longer be found', () => {
    expect(resolveStopBack({ kind: 'route', route: 'ttc::gone' }, agencies, findRoute)).toEqual({ to: 'Map', target: { kind: 'map' } });
    expect(resolveStopBack({ kind: 'agency', agencySlug: 'gone' }, agencies, findRoute).target).toEqual({ kind: 'map' });
    expect(resolveStopBack({ kind: 'onDemand', selection: 'gone::x' }, agencies, findRoute).target).toEqual({ kind: 'map' });
  });
});
