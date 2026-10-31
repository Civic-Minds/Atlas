import { describe, expect, it } from 'vitest';
import { routeListDisplay } from '../effectiveHeadway';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import ttc102json from './fixtures/ttc-102-weekday.json';

// TTC 102 Markham Rd, weekday (properties only).
const ttc102 = (ttc102json as unknown as GeoJSON.FeatureCollection).features.map(f => f.properties as unknown as ShapeProperties);

// #1231: a list range starts at the lowest number the route card shows.
describe('route list range from the card', () => {
  it('starts at the card\'s lowest row, not a stretch the card does not show (TTC 102 midday: 20 and 30, was 5–30)', () => {
    expect(routeListDisplay(ttc102, 'midday')).toMatchObject({ headway: 30, sharedHeadway: 20 });
  });
  it('starts at the card\'s Shared stretch row where it has one (TTC 102 PM: every 7)', () => {
    expect(routeListDisplay(ttc102, 'pmPeak').sharedHeadway).toBe(7);
  });
  it('shows no number or range where every pattern is span (#1247: the filter reads no service there)', () => {
    const limited = ttc102.map(d => ({ ...d, tier: 'span' }) as ShapeProperties);
    expect(routeListDisplay(limited, 'midday')).toMatchObject({ headway: null, noRegular: true });
    expect(routeListDisplay(limited, 'midday').sharedHeadway).toBeUndefined();
  });
});
