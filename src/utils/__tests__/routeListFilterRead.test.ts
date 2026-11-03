import { describe, expect, it } from 'vitest';
import { routeListDisplay } from '../effectiveHeadway';
import { routeFilterContract } from '../stretchCard';
import type { ShapeProperties } from '../../hooks/useIntervalStats';

// #1247: the list reads the stored filter value only where the map's filter does: a row that is not span and runs in the period.
const row = (over: Record<string, unknown>) => ({
  routeId: 'E', directionId: 0, routeShortName: 'E', routeLongName: null, tier: 60, headway: 53,
  routeFilterHeadwayByPeriod: { amPeak: 53 }, routeRunsByPeriod: { amPeak: true }, headwayByPeriod: { amPeak: 53 },
  ...over,
}) as unknown as ShapeProperties;

describe('route list value as the filter reads it (#1247)', () => {
  it('AC Transit E weekday AM: both rows span, so no number while the route fails every filter', () => {
    const rows = [row({ tier: 'span' }), row({ tier: 'span', directionId: 1 })];
    expect(routeFilterContract(rows, 'amPeak')?.filterValue).toBeNull();
    expect(routeListDisplay(rows, 'amPeak')).toMatchObject({ headway: null, noRegular: true });
  });
  it('a row with no period value of its own does not carry the stored value either', () => {
    const rows = [row({ headwayByPeriod: {} })];
    expect(routeListDisplay(rows, 'amPeak')).toMatchObject({ headway: null, noRegular: true });
  });
  it('keeps the number when one row qualifies, as the filter does', () => {
    const rows = [row({ tier: 'span' }), row({ directionId: 1 })];
    expect(routeListDisplay(rows, 'amPeak').headway).toBe(53);
  });
});
