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
  it('reads as the route does when the route has no regular service on All day', () => {
    const d = { routeId: 'r', routeShortName: '1', routeLongName: '', directionId: 0, headsign: 'A', tier: '10', headway: 10 } as unknown as ShapeProperties;
    const row = routeCardRowValue(d, { ...ctx, period: 'all', noRegularService: true });
    expect(row.rowNoRegular).toBe(true);
    expect(row.headway).toBeUndefined();
    expect(row.isLimited).toBe(true);
  });
});
