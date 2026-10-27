import { describe, expect, it } from 'vitest';
import { isRailRoute } from '../routeMode';

// CIV-989 / #1084: the pipeline's rail decision honours the agency's mode overrides and its light-rail list.
describe('isRailRoute', () => {
  it('a route the agency lists as light rail is rail (SFMTA N, published as a streetcar)', () => {
    expect(isRailRoute({ route_type: '0', route_short_name: 'N' }, 'sfmta')).toBe(true);
    expect(isRailRoute({ route_type: '0', route_short_name: 'N' }, undefined)).toBe(false);
  });

  it('an agency on the light-rail list reads its streetcar-typed routes as rail (OC Transpo O-Train)', () => {
    expect(isRailRoute({ route_type: '0', route_short_name: '1' }, 'octranspo')).toBe(true);
  });

  it('a people mover stays off the rail path, as a streetcar was (#1119)', () => {
    expect(isRailRoute({ route_type: '0', route_short_name: 'PRT' }, 'wvu-prt')).toBe(false);
  });

  it('buses and missing routes are not rail', () => {
    expect(isRailRoute({ route_type: '3', route_short_name: '7' }, 'ttc')).toBe(false);
    expect(isRailRoute(undefined, 'ttc')).toBe(false);
  });
});
