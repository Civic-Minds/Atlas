import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { hasStretchRoles, routeContract, stretchRowFeatures } from '../stretchCard';

const f = (over: Record<string, unknown>) => ({ routeId: 'r', directionId: 0, tier: 'frequent', headway: 6, routeShortName: '1', routeLongName: null, ...over }) as unknown as ShapeProperties;

describe('stretchRowFeatures', () => {
  it('gives one row per direction for TTC 505: the main stretch, never the short turns', () => {
    const rows = stretchRowFeatures([
      f({ headsign: 'Broadview Ave', stretchRole: 'variant' }),
      f({ headsign: 'Broadview', stretchRole: 'main', stretchIndex: 0, stopOrder: ['a', 'b', 'c', 'd'] }),
      f({ headsign: 'Broadview Ave', stretchRole: 'variant' }),
    ], 'midday');
    expect(rows.map(r => r.headsign)).toEqual(['Broadview']);
  });
  it('lists the main stretch first and each tail in index order (TTC 507 direction 1)', () => {
    const rows = stretchRowFeatures([
      f({ headsign: 'Marine Parade', stretchRole: 'tail', stretchIndex: 1 }),
      f({ headsign: 'Kipling', stretchRole: 'main', stretchIndex: 0 }),
      f({ headsign: 'Long Branch', stretchRole: 'tail', stretchIndex: 0 }),
    ], 'midday');
    expect(rows.map(r => r.headsign)).toEqual(['Kipling', 'Long Branch', 'Marine Parade']);
  });
  it('picks the feature that draws the most stops when several share a role', () => {
    const rows = stretchRowFeatures([
      f({ headsign: 'short', stretchRole: 'tail', stretchIndex: 0, stopOrder: ['a', 'b'] }),
      f({ headsign: 'long', stretchRole: 'tail', stretchIndex: 0, stopOrder: ['a', 'b', 'c'] }),
    ], 'midday');
    expect(rows.map(r => r.headsign)).toEqual(['long']);
  });
});

describe('hasStretchRoles', () => {
  it('is true only when every feature carries a role', () => {
    expect(hasStretchRoles([f({ stretchRole: 'main' }), f({ stretchRole: 'variant' })])).toBe(true);
    expect(hasStretchRoles([f({ stretchRole: 'main' }), f({})])).toBe(false);
    expect(hasStretchRoles([])).toBe(false);
  });
});

describe('routeContract', () => {
  const props = { routeFilterHeadwayByPeriod: { midday: 25, overnight: null }, routeRunsByPeriod: { midday: true, overnight: false }, stretchPeriodRange: { midday: [8, 25], overnight: null } };
  it('reads the filter value and the range for a period', () => {
    expect(routeContract([f(props)], 'midday')).toEqual({ filterValue: 25, runs: true, range: [8, 25] });
  });
  it('null means no regular service, never a number', () => {
    expect(routeContract([f(props)], 'overnight')).toEqual({ filterValue: null, runs: false, range: null });
  });
  it('is absent for All day and for data without the fields', () => {
    expect(routeContract([f(props)], 'all')).toBeUndefined();
    expect(routeContract([f({})], 'midday')).toBeUndefined();
  });
  it('treats a range whose ends match as one number', () => {
    expect(routeContract([f({ routeFilterHeadwayByPeriod: { midday: 15 }, stretchPeriodRange: { midday: [15, 15] } })], 'midday')!.range).toBeNull();
  });
});
