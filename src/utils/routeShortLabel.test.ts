import { describe, expect, it } from 'vitest';
import { routeShortLabel, routesShortLabel, withRouteWord } from './format';

// CIV-1569: "Route " + a route's number comes from one place, built on routeLabels().primary.
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('routeShortLabel (CIV-1569)', () => {
  it('keeps the agency form of the number, drops leading zeros', () => {
    expect(routeShortLabel('504')).toBe('Route 504');
    expect(routeShortLabel('52A')).toBe('Route 52A');
    expect(routeShortLabel('01')).toBe('Route 1');
    expect(routeShortLabel('SSSF')).toBe('Route SSSF');
    expect(routeShortLabel(' 1X ')).toBe('Route 1X');
    expect(routeShortLabel('')).toBe('');
    expect(routeShortLabel(null)).toBe('');
  });

  it('lists several routes after one "Routes"', () => {
    expect(routesShortLabel(['504'])).toBe('Route 504');
    expect(routesShortLabel(['501', '504'])).toBe('Routes 501, 504');
    expect(routesShortLabel([])).toBe('');
  });

  it('puts "Route " before a label already built', () => {
    expect(withRouteWord('504 — King')).toBe('Route 504 — King');
  });
});
