import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { routeListCellText, routeListDisplay, routeListFilterDisplay } from '../effectiveHeadway';
import oc6json from './fixtures/octranspo-6-weekday.json';

// OC Transpo 6 Rockcliffe, weekday (public release, per-stop fields left out).
const oc6Features = (oc6json as unknown as GeoJSON.FeatureCollection).features;
const oc6 = oc6Features.map(f => f.properties as unknown as ShapeProperties);

// CIV-1300 (#1311, Ryan "1"): lists and agency pages read the route card's own words, never a worst wait as "every N".
describe('route lists read the card\'s words for an unsteady period', () => {
  it('OC Transpo 6 weekday midday: the card reads "every 15 min, with one 32 min gap", and so does the list (was "every 32")', () => {
    expect(routeListFilterDisplay(oc6, 'midday').headway).toBe(32);
    const list = routeListDisplay(oc6, 'midday');
    expect(list).toMatchObject({ headway: 15, colorHeadway: 32, edgeText: 'every 15 min, with one 32 min gap' });
    expect(routeListCellText(list, true)).toBe('every 15 min, with one 32 min gap');
  });
});
