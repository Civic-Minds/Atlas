import { describe, it, expect } from 'vitest';
import {
  effectiveMode,
  getGtfsModeName,
  isRailReplacementBus,
  normalizeRouteType,
  VIRTUAL_LRT_MODE,
} from '../modes';

describe('normalizeRouteType', () => {
  it('coerces string GTFS types', () => {
    expect(normalizeRouteType('3')).toBe(3);
    expect(normalizeRouteType('1')).toBe(1);
    expect(normalizeRouteType('702')).toBe(3);
  });

  it('defaults missing values to bus', () => {
    expect(normalizeRouteType(undefined)).toBe(3);
    expect(normalizeRouteType(null)).toBe(3);
  });
});

describe('effectiveMode', () => {
  it('maps extended Express Bus routes to the Bus mode', () => {
    expect(effectiveMode({ routeType: 702 })).toBe(3);
  });

  it('classifies OC Transpo O-Train as LRT', () => {
    expect(effectiveMode({
      routeType: 0,
      routeLongName: 'Confederation Line',
      agencySlug: 'octranspo',
    })).toBe(VIRTUAL_LRT_MODE);
  });

  it('classifies TTC Line 5 as LRT', () => {
    expect(effectiveMode({
      routeType: '0',
      routeLongName: 'Line 5 Eglinton',
      agencySlug: 'ttc',
    })).toBe(VIRTUAL_LRT_MODE);
  });

  it('keeps streetcar separate from LRT', () => {
    expect(effectiveMode({
      routeType: 0,
      routeLongName: '501 Queen',
      agencySlug: 'ttc',
    })).toBe(0);
  });

  it('classifies known route_type=0 LRT feeds', () => {
    expect(effectiveMode({ routeType: 0, agencySlug: 'calgary', routeLongName: 'Red Line - Somerset - Bridlewood/Tuscany CTrain' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'edmonton', routeLongName: 'Capital Line' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'valleymetro', routeLongName: 'Valley Metro Rail A Line' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'sdmts', routeShortName: 'Blue', routeLongName: 'San Ysidro - UTC' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'metro-transit', routeLongName: 'METRO Blue Line' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'nfta', routeLongName: 'Metro Rail' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'gcrta', routeShortName: 'WL', routeLongName: 'Waterfront Line' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'sacrt', routeShortName: 'Gold', routeLongName: 'Downtown - Folsom' })).toBe(VIRTUAL_LRT_MODE);
  });
});

describe('isRailReplacementBus', () => {
  it('recognizes explicitly named rail replacement buses', () => {
    expect(isRailReplacementBus({ routeType: 3, routeLongName: 'Blue Line Replacement Bus' })).toBe(true);
    expect(isRailReplacementBus({ routeType: 3, routeLongName: 'Blue Line' })).toBe(false);
  });
});

describe('getGtfsModeName extended codes (CIV-1812)', () => {
  it('names each extended range as the GTFS extended route types list does', () => {
    const names = Object.fromEntries([100, 200, 400, 401, 402, 405, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1700].map(c => [c, getGtfsModeName(c)]));
    expect(names).toEqual({
      100: 'Commuter Rail', 200: 'Bus', 400: 'Tram/Light Rail', 401: 'Subway/Metro', 402: 'Subway/Metro', 405: 'Tram/Light Rail',
      500: 'Subway/Metro', 600: 'Subway/Metro', 700: 'Bus', 800: 'Bus', 900: 'Tram/Light Rail',
      1000: 'Ferry', 1100: 'Transit', 1200: 'Ferry', 1300: 'Gondola', 1400: 'Funicular', 1500: 'Transit', 1700: 'Transit',
    });
  });
});
