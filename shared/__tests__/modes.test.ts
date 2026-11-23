import { describe, it, expect } from 'vitest';
import {
  effectiveMode,
  getGtfsModeName,
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

  it('keeps streetcar separate from LRT', () => {
    expect(effectiveMode({
      routeType: 0,
      routeLongName: '501 Queen',
      agencySlug: 'ttc',
    })).toBe(0);
  });

  it('never guesses light rail from agency or route names (CIV-2025; "Modes are never guessed from names", 2026-10-13)', () => {
    expect(effectiveMode({ routeType: '0', routeLongName: 'Line 7 Example', agencySlug: 'not-listed' })).toBe(0);
    expect(effectiveMode({ routeType: 0, agencySlug: 'not-listed', routeLongName: 'Red Line CTrain' })).toBe(0);
    expect(effectiveMode({ routeType: 0, agencySlug: 'not-listed', routeLongName: 'METRO Purple Line' })).toBe(0);
    expect(effectiveMode({ routeType: 0, agencySlug: 'calgary', routeShortName: '999', routeLongName: 'Somewhere' })).toBe(0);
    expect(effectiveMode({ routeType: 2, agencySlug: 'grt-x', routeLongName: 'ION light rail' })).toBe(2);
  });

  it("an agency's listed correction still makes a route light rail (CIV-2025 listed the lines the old name rule found)", () => {
    expect(effectiveMode({ routeType: '0', routeShortName: '5', routeLongName: 'Line 5 Eglinton', agencySlug: 'ttc' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, routeShortName: '201', routeLongName: 'Red Line - Somerset - Bridlewood/Tuscany CTrain', agencySlug: 'calgary' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'sdmts', routeShortName: 'Blue', routeLongName: 'San Ysidro - UTC' })).toBe(VIRTUAL_LRT_MODE);
    expect(effectiveMode({ routeType: 0, agencySlug: 'nfta', routeLongName: 'Metro Rail' })).toBe(VIRTUAL_LRT_MODE);
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
