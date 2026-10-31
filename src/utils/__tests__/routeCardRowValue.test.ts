import { describe, expect, it } from 'vitest';
import { routeCardRowValue } from '../routeCardRowValue';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

const ctx = { period: 'midday' as const, hoveredHour: null, stretchMode: false, noRegularService: false, maxHeadway: Infinity };

describe('routeCardRowValue (CIV-992)', () => {
  it('shows a steady row its own cadence, coloured by the filter value', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10, headwayByPeriod: { midday: 10 } } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, ctx);
    expect(row.headway).toBe(10);
    expect(row.isLimited).toBe(false);
    expect(row.dimmed).toBe(false);
  });
  it('reads as the route does when the route has no regular cadence on All day', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10 } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, { ...ctx, period: 'all', noRegularService: true });
    expect(row.rowNoRegular).toBe(true);
    expect(row.headway).toBeUndefined();
    expect(row.isLimited).toBe(true);
  });

  // #1142 (CIV-1018): TTC 320 southbound, weekday overnight: every 5 from 2:00 to 3:20, then every 15 or more.
  const uneven = (role: 'main' | 'tail', typical: number | null) => ({
    routeId: '320', routeShortName: '320', routeLongName: 'Yonge', directionId: 0, headsign: 'Queens Quay', tier: '10',
    headway: 7, headwayByPeriod: { overnight: 7 }, stretchRole: role, stretchIndex: 0,
    stretchPeriodHeadway: { overnight: 18 }, stretchPeriodTypical: { overnight: typical },
  }) as unknown as ShapeProperties;
  const overnight = { ...ctx, period: 'overnight' as const, stretchMode: true };

  it("reads an uneven period's main row as typical to worst, its number the worst wait", () => {
    const row = routeCardRowValue(uneven('main', 5), overnight);
    expect(row.headway).toBe(18);
    expect(row.headwayLabel).toBe('every 5–18 min');
  });
  it('leaves a steady period, a tail and the hovered hour as they were', () => {
    expect(routeCardRowValue(uneven('main', null), overnight).headwayLabel).toBeUndefined();
    expect(routeCardRowValue(uneven('tail', 5), overnight).headwayLabel).toBeUndefined();
    expect(routeCardRowValue(uneven('main', 5), { ...overnight, hoveredHour: 2 }).headwayLabel).toBeUndefined();
  });

  // CIV-1143 (option B): OC Transpo 84 to Centrepointe, weekday PM: the last trip is at 5:05 PM. The row keeps its own words;
  // the shared-stretch range ("every 60–120 min") never replaces them.
  const oc84 = (edge: boolean) => ({
    routeId: '84', routeShortName: '84', routeLongName: '', directionId: 0, headsign: 'Centrepointe', tier: '60', headway: 60,
    headwayByPeriod: { pmPeak: 60 }, headsignMinStopHeadwayByPeriod: { pmPeak: 20 }, stretchRole: 'main', stretchIndex: 0,
    ...(edge ? { stretchPeriodEdge: { pmPeak: { until: 1025, every: 60 } } } : {}),
  }) as unknown as ShapeProperties;
  const pm = { ...ctx, period: 'pmPeak' as const, stretchMode: true };

  it('gives no shared-stretch range to a row with its own until / from / gap words (CIV-1143)', () => {
    const row = routeCardRowValue(oc84(true), pm);
    expect(row.edgeText).toBe('every 60 min until 5:05 PM');
    expect(row.trunkHeadway).toBeUndefined();
  });
  it('keeps the range on a row without such words', () => {
    expect(routeCardRowValue(oc84(false), pm).trunkHeadway).toBe(20);
  });
});
