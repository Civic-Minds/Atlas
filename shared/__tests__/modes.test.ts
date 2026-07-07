import { describe, it, expect } from 'vitest';
import {
  effectiveMode,
  normalizeRouteType,
  VIRTUAL_LRT_MODE,
} from '../modes';

describe('normalizeRouteType', () => {
  it('coerces string GTFS types', () => {
    expect(normalizeRouteType('3')).toBe(3);
    expect(normalizeRouteType('1')).toBe(1);
  });

  it('defaults missing values to bus', () => {
    expect(normalizeRouteType(undefined)).toBe(3);
    expect(normalizeRouteType(null)).toBe(3);
  });
});

describe('effectiveMode', () => {
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
});
